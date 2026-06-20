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
}