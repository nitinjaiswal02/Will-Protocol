// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../WillProtocol.sol";

/// @dev Attack contract used ONLY in tests to verify reentrancy protection.
///      Deployed as the nominee of a will, then attempts to re-enter claim()
///      inside its receive() function when funds arrive.
contract MaliciousNominee {
    WillProtocol public immutable target;
    address public owner;
    uint256 public attackCount;

    event AttackAttempted(uint256 count, bool success);

    constructor(address _target) {
        target = WillProtocol(_target);
    }

    function setOwner(address _owner) external {
        owner = _owner;
    }

    // This fires when our contract receives ETH during claim()
    receive() external payable {
        attackCount++;
        // Try to claim again before the first claim finishes
        if (attackCount < 3) {
            try target.claim(owner) {
                emit AttackAttempted(attackCount, true);
            } catch {
                // Our defense reverted it — attack failed as expected
                emit AttackAttempted(attackCount, false);
            }
        }
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
}