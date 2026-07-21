// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PactSwapEscrow
 * @notice P2P USDT escrow for PACTSWAP on BSC.
 *
 * Flow:
 *   1. Buyer locks USDT via createEscrow().
 *   2. Buyer sends NGN fiat to the seller's bank and marks the order paid in the UI.
 *   3. Seller (having received NGN) calls releaseEscrow() → USDT sent to buyer, fee to platform.
 *   4. In disputes the arbiter can call releaseEscrow() or refundEscrow().
 *
 * KEY FIX (v2): releaseEscrow now allows msg.sender == seller OR msg.sender == arbiter.
 *               Previously it was arbiter-only, so sellers could never release.
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PactSwapEscrow is ReentrancyGuard {
    // ── Immutables ────────────────────────────────────────────────────────────
    IERC20  public immutable usdtToken;
    address public immutable feeRecipient;
    address public immutable arbiter;

    uint256 public constant FEE_BPS          = 250;    // 2.5 %
    uint256 public constant AUTO_RELEASE_TIME = 604800; // 7 days

    // ── Storage ───────────────────────────────────────────────────────────────
    struct Escrow {
        address buyer;          // locked USDT, wants to receive nothing (already paid)
        address seller;         // receives USDT after confirming NGN received
        uint256 amount;         // USDT locked (6-decimal units)
        uint256 createdAt;
        bool    released;
        bool    refunded;
        bool    sellerConfirmed; // set by confirmDelivery(); optional signal
    }

    mapping(bytes32 => Escrow) public escrows;
    bytes32[] public activeEscrowIds;

    // ── Events ────────────────────────────────────────────────────────────────
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed buyer,
        address indexed seller,
        uint256 amount
    );
    event EscrowReleased(
        bytes32 indexed escrowId,
        address to,
        uint256 sellerAmount,
        uint256 feeAmount
    );
    event EscrowRefunded(
        bytes32 indexed escrowId,
        address to,
        uint256 amount
    );
    event SellerConfirmed(bytes32 indexed escrowId);

    // ── Constructor ───────────────────────────────────────────────────────────
    constructor(address _usdtToken, address _feeRecipient) {
        require(_usdtToken    != address(0), "Invalid USDT token");
        require(_feeRecipient != address(0), "Invalid fee recipient");
        usdtToken    = IERC20(_usdtToken);
        feeRecipient = _feeRecipient;
        arbiter      = msg.sender; // deployer becomes arbiter
    }

    // ── Buyer: lock USDT into escrow ──────────────────────────────────────────
    function createEscrow(
        bytes32 _escrowId,
        address _seller,
        uint256 _amount
    ) external nonReentrant {
        require(escrows[_escrowId].buyer == address(0), "Escrow already exists");
        require(_seller != address(0),                  "Invalid seller");
        require(_seller != msg.sender,                  "Buyer cannot be seller");
        require(_amount > 0,                            "Amount must be > 0");

        require(
            usdtToken.transferFrom(msg.sender, address(this), _amount),
            "USDT transfer failed"
        );

        escrows[_escrowId] = Escrow({
            buyer:           msg.sender,
            seller:          _seller,
            amount:          _amount,
            createdAt:       block.timestamp,
            released:        false,
            refunded:        false,
            sellerConfirmed: false
        });

        activeEscrowIds.push(_escrowId);
        emit EscrowCreated(_escrowId, msg.sender, _seller, _amount);
    }

    // ── Seller: signal that they received the fiat payment (optional step) ────
    function confirmDelivery(bytes32 _escrowId) external {
        Escrow storage e = escrows[_escrowId];
        require(e.buyer != address(0),          "Escrow not found");
        require(msg.sender == e.seller,         "Only seller");
        require(!e.released && !e.refunded,     "Already settled");

        e.sellerConfirmed = true;
        emit SellerConfirmed(_escrowId);
    }

    /**
     * @notice Release USDT to buyer.
     *
     * PACTSWAP flow: buyer sent NGN fiat → seller confirms receipt → calls this
     * function → USDT sent to buyer (minus platform fee).
     *
     * @dev msg.sender must be the escrow seller OR the arbiter.
     *      Previously arbiter-only — this is the v2 fix.
     */
    function releaseEscrow(bytes32 _escrowId) external nonReentrant {
        Escrow storage e = escrows[_escrowId];
        require(e.buyer != address(0),                              "Escrow not found");
        require(
            msg.sender == e.seller || msg.sender == arbiter,
            "Not seller or arbiter"
        );
        require(!e.released && !e.refunded, "Already settled");

        uint256 fee        = (e.amount * FEE_BPS) / 10000;
        uint256 buyerAmount = e.amount - fee;

        e.released = true;

        // USDT → buyer (the person who locked it and sent fiat to seller)
        require(usdtToken.transfer(e.buyer, buyerAmount), "USDT to buyer failed");
        if (fee > 0) {
            require(usdtToken.transfer(feeRecipient, fee), "Fee transfer failed");
        }

        emit EscrowReleased(_escrowId, e.buyer, buyerAmount, fee);
        _removeActiveEscrow(_escrowId);
    }

    // ── Arbiter: refund buyer when dispute is resolved in buyer's favour ───────
    function refundEscrow(bytes32 _escrowId) external nonReentrant {
        Escrow storage e = escrows[_escrowId];
        require(e.buyer != address(0),      "Escrow not found");
        require(msg.sender == arbiter,      "Only arbiter");
        require(!e.released && !e.refunded, "Already settled");

        uint256 amount = e.amount;
        e.refunded = true;

        require(usdtToken.transfer(e.buyer, amount), "USDT refund failed");
        emit EscrowRefunded(_escrowId, e.buyer, amount);
        _removeActiveEscrow(_escrowId);
    }

    // ── Anyone: auto-release any escrow older than AUTO_RELEASE_TIME ──────────
    function processExpiredEscrows() external nonReentrant {
        uint256 i = 0;
        while (i < activeEscrowIds.length) {
            bytes32 id = activeEscrowIds[i];
            Escrow storage e = escrows[id];

            if (
                !e.released &&
                !e.refunded &&
                block.timestamp >= e.createdAt + AUTO_RELEASE_TIME
            ) {
                uint256 fee        = (e.amount * FEE_BPS) / 10000;
                uint256 buyerAmount = e.amount - fee;
                e.released = true;

                usdtToken.transfer(e.buyer, buyerAmount);
                if (fee > 0) usdtToken.transfer(feeRecipient, fee);

                emit EscrowReleased(id, e.buyer, buyerAmount, fee);
                _removeActiveEscrowAt(i); // do NOT increment i (slot filled by last element)
            } else {
                i++;
            }
        }
    }

    // ── Views ─────────────────────────────────────────────────────────────────
    function getActiveEscrowCount() external view returns (uint256) {
        return activeEscrowIds.length;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────
    function _removeActiveEscrow(bytes32 _escrowId) internal {
        for (uint256 i = 0; i < activeEscrowIds.length; i++) {
            if (activeEscrowIds[i] == _escrowId) {
                _removeActiveEscrowAt(i);
                return;
            }
        }
    }

    function _removeActiveEscrowAt(uint256 index) internal {
        uint256 last = activeEscrowIds.length - 1;
        if (index != last) {
            activeEscrowIds[index] = activeEscrowIds[last];
        }
        activeEscrowIds.pop();
    }
}
