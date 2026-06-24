// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract WillProtocol {
    struct Will {
        address nominee;
        uint256 lastActive;
        uint256 inactivityPeriod;
        uint256 amount;
        bool exists;
    }

    mapping(address => Will) public wills;

    event WillCreated(
        address indexed owner,
        address indexed nominee,
        uint256 amount,
        uint256 inactivityPeriod
    );

    function createWill(address nominee, uint256 inactivityPeriod) external payable {
        require(msg.value > 0, "Deposit must be greater than zero");
        require(nominee != address(0), "Nominee cannot be the zero address");
        require(nominee != msg.sender, "You cannot be your own nominee");
        require(inactivityPeriod >= 7 days, "Inactivity period too short");
        require(!wills[msg.sender].exists, "Will already exists for this address");

        wills[msg.sender] = Will({
            nominee: nominee,
            lastActive: block.timestamp,
            inactivityPeriod: inactivityPeriod,
            amount: msg.value,
            exists: true
        });

        emit WillCreated(msg.sender, nominee, msg.value, inactivityPeriod);
    }

    // Now Adding ping(), cancelWill(), updateNominee(), and their events.

    event Pinged(address indexed owner, uint256 timestamp);
    event WillCancelled(address indexed owner, uint256 refundAmount);
    event NomineeUpdated(address indexed owner, address indexed newNominee);

    function ping() external {
        require(wills[msg.sender].exists, "No will exists for this address");
        wills[msg.sender].lastActive = block.timestamp;
        emit Pinged(msg.sender, block.timestamp);
    }

    function updateNominee(address newNominee) external {
        require(wills[msg.sender].exists, "No will exists for this address");
        require(newNominee != address(0), "Nominee cannot be the zero address");
        require(newNominee != msg.sender, "You cannot be your own nominee");

        wills[msg.sender].nominee = newNominee;
        emit NomineeUpdated(msg.sender, newNominee);
    }

    function cancelWill() external {
        require(wills[msg.sender].exists, "No will exists for this address");

        uint256 refundAmount = wills[msg.sender].amount;

        // Effects: update state BEFORE the external interaction below
        delete wills[msg.sender];

        // Interaction: send funds last, after state is already consistent
        (bool success, ) = msg.sender.call{value: refundAmount}("");
        require(success, "Refund transfer failed");

        emit WillCancelled(msg.sender, refundAmount);
    }
}