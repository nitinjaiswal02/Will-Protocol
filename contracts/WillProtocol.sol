
// contract WillProtocol {
//     struct Will {
//         address nominee;
//         uint256 lastActive;
//         uint256 inactivityPeriod;
//         uint256 amount;
//         bool exists;
//     }

//     mapping(address => Will) public wills;

//     event WillCreated(
//         address indexed owner,
//         address indexed nominee,
//         uint256 amount,
//         uint256 inactivityPeriod
//     );

//     function createWill(address nominee, uint256 inactivityPeriod) external payable {
//         require(msg.value > 0, "Deposit must be greater than zero");
//         require(nominee != address(0), "Nominee cannot be the zero address");
//         require(nominee != msg.sender, "You cannot be your own nominee");
//         require(inactivityPeriod >= 7 days, "Inactivity period too short");
//         require(!wills[msg.sender].exists, "Will already exists for this address");

//         wills[msg.sender] = Will({
//             nominee: nominee,
//             lastActive: block.timestamp,
//             inactivityPeriod: inactivityPeriod,
//             amount: msg.value,
//             exists: true
//         });

//         emit WillCreated(msg.sender, nominee, msg.value, inactivityPeriod);
//     }

//     // Now Adding ping(), cancelWill(), updateNominee(), and their events.

//     event Pinged(address indexed owner, uint256 timestamp);
//     event WillCancelled(address indexed owner, uint256 refundAmount);
//     event NomineeUpdated(address indexed owner, address indexed newNominee);

//     function ping() external {
//         require(wills[msg.sender].exists, "No will exists for this address");
//         wills[msg.sender].lastActive = block.timestamp;
//         emit Pinged(msg.sender, block.timestamp);
//     }

//     function updateNominee(address newNominee) external {
//         require(wills[msg.sender].exists, "No will exists for this address");
//         require(newNominee != address(0), "Nominee cannot be the zero address");
//         require(newNominee != msg.sender, "You cannot be your own nominee");

//         wills[msg.sender].nominee = newNominee;
//         emit NomineeUpdated(msg.sender, newNominee);
//     }

//     function cancelWill() external {
//         require(wills[msg.sender].exists, "No will exists for this address");

//         uint256 refundAmount = wills[msg.sender].amount;

//         // Effects: update state BEFORE the external interaction below
//         delete wills[msg.sender];

//         // Interaction: send funds last, after state is already consistent
//         (bool success, ) = msg.sender.call{value: refundAmount}("");
//         require(success, "Refund transfer failed");

//         emit WillCancelled(msg.sender, refundAmount);
//     }

//     // Adding claim(address owner) and the Claimed event.

//     event Claimed(address indexed owner, address indexed nominee, uint256 amount);

//     /// @dev Uses a push-payment pattern: funds are sent directly to `will.nominee`.
//     /// It is the WILL OWNER'S responsibility to ensure the nominee address
//     /// can receive native currency. If it cannot, this call will revert and
//     /// the funds will remain locked with no recovery path under this design.

//     function claim(address owner) external {
//         Will storage will = wills[owner];

//         require(will.exists, "No will exists for this address");
//         require(msg.sender == will.nominee, "Only the nominee can claim");
//         require(
//             block.timestamp >= will.lastActive + will.inactivityPeriod,
//             "Owner is still within the active period"
//         );

//         uint256 claimAmount = will.amount;

//         // Effects: delete before the external call
//         delete wills[owner];

//         // Interaction: send funds last
//         (bool success, ) = msg.sender.call{value: claimAmount}("");
//         require(success, "Claim transfer failed");

//         emit Claimed(owner, msg.sender, claimAmount);
//     }
// }


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

    event WillCreated(address indexed owner, address indexed nominee, uint256 amount, uint256 inactivityPeriod);
    event Pinged(address indexed owner, uint256 timestamp);
    event NomineeUpdated(address indexed owner, address indexed newNominee);
    event WillCancelled(address indexed owner, uint256 refundAmount);
    event Claimed(address indexed owner, address indexed nominee, uint256 amount);

    error InsufficientDeposit();
    error InvalidNominee();
    error InactivityPeriodTooShort();
    error WillAlreadyExists();
    error WillDoesNotExist();
    error NotNominee();
    error StillActive();
    error TransferFailed();

    modifier willExists(address owner) {
        if (!wills[owner].exists) revert WillDoesNotExist();
        _;
    }

    modifier onlyNominee(address owner) {
        if (msg.sender != wills[owner].nominee) revert NotNominee();
        _;
    }

    /// @dev Push-payment pattern: funds go directly to `will.nominee`.
    ///      It is the OWNER'S responsibility to set a nominee address
    ///      capable of receiving native currency. If it cannot, claim()
    ///      will revert with no recovery path under this design.
    function createWill(address nominee, uint256 inactivityPeriod) external payable {
        if (msg.value == 0) revert InsufficientDeposit();
        if (nominee == address(0) || nominee == msg.sender) revert InvalidNominee();
        if (inactivityPeriod < 7 days) revert InactivityPeriodTooShort();
        if (wills[msg.sender].exists) revert WillAlreadyExists();

        wills[msg.sender] = Will({
            nominee: nominee,
            lastActive: block.timestamp,
            inactivityPeriod: inactivityPeriod,
            amount: msg.value,
            exists: true
        });

        emit WillCreated(msg.sender, nominee, msg.value, inactivityPeriod);
    }

    function ping() external willExists(msg.sender) {
        wills[msg.sender].lastActive = block.timestamp;
        emit Pinged(msg.sender, block.timestamp);
    }

    function updateNominee(address newNominee) external willExists(msg.sender) {
        if (newNominee == address(0) || newNominee == msg.sender) revert InvalidNominee();
        wills[msg.sender].nominee = newNominee;
        emit NomineeUpdated(msg.sender, newNominee);
    }

    function cancelWill() external willExists(msg.sender) {
        uint256 refundAmount = wills[msg.sender].amount;
        delete wills[msg.sender];

        (bool success, ) = msg.sender.call{value: refundAmount}("");
        if (!success) revert TransferFailed();

        emit WillCancelled(msg.sender, refundAmount);
    }

    function claim(address owner) external willExists(owner) onlyNominee(owner) {
        Will storage will = wills[owner];
        if (block.timestamp < will.lastActive + will.inactivityPeriod) revert StillActive();

        uint256 claimAmount = will.amount;
        delete wills[owner];

        (bool success, ) = msg.sender.call{value: claimAmount}("");
        if (!success) revert TransferFailed();

        emit Claimed(owner, msg.sender, claimAmount);
    }
}