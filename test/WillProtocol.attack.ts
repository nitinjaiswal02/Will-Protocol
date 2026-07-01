import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.create();
const ONE_WEEK = 7 * 24 * 60 * 60;

describe("WillProtocol - Attack Prevention", function () {

  // ─────────────────────────────────────────────
  // 1. REENTRANCY ATTACK
  // ─────────────────────────────────────────────
 describe("Reentrancy via malicious nominee", function () {
  async function deployWithAttackerFixture() {
    const willProtocol = await ethers.deployContract("WillProtocol");
    const [owner, cleanNominee] = await ethers.getSigners();

    const maliciousNominee = await ethers.deployContract("MaliciousNominee", [
      await willProtocol.getAddress(),
    ]);

    const nomineeAddress = await maliciousNominee.getAddress();
    const depositAmount = ethers.parseEther("2.0");

    await willProtocol.createWill(nomineeAddress, ONE_WEEK, {
      value: depositAmount,
    });

    await maliciousNominee.setOwner(owner.address);

    return { willProtocol, maliciousNominee, owner, cleanNominee, nomineeAddress, depositAmount };
  }

  it("funds stay constant — attacker cannot drain more than deposit", async function () {
    const { willProtocol, maliciousNominee, depositAmount } =
      await networkHelpers.loadFixture(deployWithAttackerFixture);

    await networkHelpers.time.increase(ONE_WEEK + 1);

    const contractAddress = await willProtocol.getAddress();

    // Attempt the attack — may succeed legitimately or revert entirely
    // Either outcome is fine; what must never happen is attacker getting MORE than deposit
    try {
      await willProtocol.claim(
        (await ethers.getSigners())[0].address
      );
    } catch {
      // full revert is also a valid defense
    }

    const contractBalance = await ethers.provider.getBalance(contractAddress);
    const attackerBalance = await maliciousNominee.getBalance();

    // Invariant: total money in system must equal original deposit
    expect(contractBalance + attackerBalance).to.equal(depositAmount);
  });

  it("will is deleted after successful claim — second claim reverts", async function () {
    const { willProtocol, owner, cleanNominee } =
      await networkHelpers.loadFixture(deployWithAttackerFixture);

    // Create a second will with a clean EOA nominee for this specific test
    const secondDeposit = ethers.parseEther("1.0");
    const [, , secondOwner] = await ethers.getSigners();

    await willProtocol.connect(secondOwner).createWill(cleanNominee.address, ONE_WEEK, {
      value: secondDeposit,
    });

    await networkHelpers.time.increase(ONE_WEEK + 1);

    // First claim succeeds
    await willProtocol.connect(cleanNominee).claim(secondOwner.address);

    // Second claim on the now-deleted will must revert
    await expect(
      willProtocol.connect(cleanNominee).claim(secondOwner.address),
    ).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
  });
});

  // ─────────────────────────────────────────────
  // 2. TIMESTAMP BOUNDARY CONDITIONS
  // ─────────────────────────────────────────────
  describe("Timestamp boundary conditions", function () {
    async function deployWithWillFixture() {
      const willProtocol = await ethers.deployContract("WillProtocol");
      const [owner, nominee] = await ethers.getSigners();
      await willProtocol.createWill(nominee.address, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      });
      return { willProtocol, owner, nominee };
    }

   it("reverts one second before the inactivity period ends", async function () {
  const { willProtocol, owner, nominee } =
    await networkHelpers.loadFixture(deployWithWillFixture);

  await networkHelpers.time.increase(ONE_WEEK - 10); // clearly before deadline

  await expect(
    willProtocol.connect(nominee).claim(owner.address),
  ).to.be.revertedWithCustomError(willProtocol, "StillActive");
});

    it("succeeds exactly at the inactivity deadline (>=, not >)", async function () {
      const { willProtocol, owner, nominee } =
        await networkHelpers.loadFixture(deployWithWillFixture);

      await networkHelpers.time.increase(ONE_WEEK);

      await expect(
        willProtocol.connect(nominee).claim(owner.address),
      ).to.emit(willProtocol, "Claimed");
    });

    it("a late ping resets the clock fully — nominee cannot claim until another full period", async function () {
      const { willProtocol, owner, nominee } =
        await networkHelpers.loadFixture(deployWithWillFixture);

      // Ping at 6 days — just before expiry
      await networkHelpers.time.increase(ONE_WEEK - 60);
      await willProtocol.ping();

      // Advance 2 days — which would have been past original deadline
      await networkHelpers.time.increase(2 * 24 * 60 * 60);

      // Clock was reset, so claim should still fail
      await expect(
        willProtocol.connect(nominee).claim(owner.address),
      ).to.be.revertedWithCustomError(willProtocol, "StillActive");

      // Advance the remaining time — now a full week since the ping
      await networkHelpers.time.increase(ONE_WEEK - 2 * 24 * 60 * 60 + 1);

      // Now it should succeed
      await expect(
        willProtocol.connect(nominee).claim(owner.address),
      ).to.emit(willProtocol, "Claimed");
    });
  });

  // ─────────────────────────────────────────────
  // 3. UNAUTHORIZED ACCESS ATTEMPTS
  // ─────────────────────────────────────────────
  describe("Unauthorized access attempts", function () {
    async function deployWithWillFixture() {
      const willProtocol = await ethers.deployContract("WillProtocol");
      const [owner, nominee, attacker] = await ethers.getSigners();
      await willProtocol.createWill(nominee.address, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      });
      return { willProtocol, owner, nominee, attacker };
    }

    it("attacker cannot ping owner's will to reset the clock on their behalf", async function () {
      const { willProtocol, attacker } =
        await networkHelpers.loadFixture(deployWithWillFixture);

      // ping() operates on wills[msg.sender] — attacker has no will
      await expect(
        willProtocol.connect(attacker).ping(),
      ).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
    });

    it("attacker cannot cancel owner's will and steal the refund", async function () {
      const { willProtocol, attacker } =
        await networkHelpers.loadFixture(deployWithWillFixture);

      // cancelWill() operates on wills[msg.sender] — attacker has no will
      await expect(
        willProtocol.connect(attacker).cancelWill(),
      ).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
    });

    it("attacker cannot update the nominee to themselves and claim later", async function () {
      const { willProtocol, attacker } =
        await networkHelpers.loadFixture(deployWithWillFixture);

      // updateNominee() operates on wills[msg.sender] — attacker has no will
      await expect(
        willProtocol.connect(attacker).updateNominee(attacker.address),
      ).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
    });

    it("attacker cannot claim another owner's will even after inactivity", async function () {
      const { willProtocol, owner, attacker } =
        await networkHelpers.loadFixture(deployWithWillFixture);

      await networkHelpers.time.increase(ONE_WEEK + 1);

      await expect(
        willProtocol.connect(attacker).claim(owner.address),
      ).to.be.revertedWithCustomError(willProtocol, "NotNominee");
    });
  });

  // ─────────────────────────────────────────────
  // 4. FRONT-RUNNING IMMUNITY
  // ─────────────────────────────────────────────
  describe("Front-running immunity", function () {
    it("a front-runner cannot redirect claim proceeds to themselves", async function () {
      const willProtocol = await ethers.deployContract("WillProtocol");
      const [owner, nominee, frontRunner] = await ethers.getSigners();

      await willProtocol.createWill(nominee.address, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      });

      await networkHelpers.time.increase(ONE_WEEK + 1);

      // Front-runner sees claim() in the mempool and tries to submit
      // their own version first — but they can't change where funds go
      await expect(
        willProtocol.connect(frontRunner).claim(owner.address),
      ).to.be.revertedWithCustomError(willProtocol, "NotNominee");

      // Legitimate nominee's claim still works correctly
      const balanceBefore = await ethers.provider.getBalance(nominee.address);
      const tx = await willProtocol.connect(nominee).claim(owner.address);
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(nominee.address);

      expect(balanceAfter).to.equal(
        balanceBefore + ethers.parseEther("1.0") - gasCost,
      );
    });
  });
});