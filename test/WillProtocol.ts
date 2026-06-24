import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.create();
const ONE_WEEK = 7 * 24 * 60 * 60;

describe("WillProtocol - createWill", function () {
  async function deployFixture() {
    const willProtocol = await ethers.deployContract("WillProtocol");
    const [owner, nominee, stranger] = await ethers.getSigners();
    return { willProtocol, owner, nominee, stranger };
  }

  it("creates a will with correct details", async function () {
    const { willProtocol, owner, nominee } = await networkHelpers.loadFixture(deployFixture);
    const depositAmount = ethers.parseEther("1.0");

    await expect(
      willProtocol.createWill(nominee.address, ONE_WEEK, { value: depositAmount }),
    )
      .to.emit(willProtocol, "WillCreated")
      .withArgs(owner.address, nominee.address, depositAmount, ONE_WEEK);

    const will = await willProtocol.wills(owner.address);
    expect(will.nominee).to.equal(nominee.address);
    expect(will.amount).to.equal(depositAmount);
    expect(will.exists).to.equal(true);
  });

  it("reverts with zero deposit", async function () {
    const { willProtocol, nominee } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      willProtocol.createWill(nominee.address, ONE_WEEK, { value: 0 }),
    ).to.be.revertedWith("Deposit must be greater than zero");
  });

  it("reverts if nominee is the zero address", async function () {
    const { willProtocol } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      willProtocol.createWill(ethers.ZeroAddress, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      }),
    ).to.be.revertedWith("Nominee cannot be the zero address");
  });

  it("reverts if nominee is the sender", async function () {
    const { willProtocol, owner } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      willProtocol.createWill(owner.address, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      }),
    ).to.be.revertedWith("You cannot be your own nominee");
  });

  it("reverts if inactivity period is too short", async function () {
    const { willProtocol, nominee } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      willProtocol.createWill(nominee.address, 60, { value: ethers.parseEther("1.0") }),
    ).to.be.revertedWith("Inactivity period too short");
  });

  it("reverts if a will already exists for the sender", async function () {
    const { willProtocol, nominee } = await networkHelpers.loadFixture(deployFixture);
    await willProtocol.createWill(nominee.address, ONE_WEEK, {
      value: ethers.parseEther("1.0"),
    });
    await expect(
      willProtocol.createWill(nominee.address, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      }),
    ).to.be.revertedWith("Will already exists for this address");
  });
});



describe("WillProtocol - ping / cancelWill / updateNominee", function () {
  async function deployWithWillFixture() {
    const willProtocol = await ethers.deployContract("WillProtocol");
    const [owner, nominee, stranger, newNominee] = await ethers.getSigners();
    await willProtocol.createWill(nominee.address, ONE_WEEK, {
      value: ethers.parseEther("1.0"),
    });
    return { willProtocol, owner, nominee, stranger, newNominee };
  }

  it("ping updates lastActive and emits Pinged", async function () {
    const { willProtocol, owner } = await networkHelpers.loadFixture(deployWithWillFixture);
    const before = (await willProtocol.wills(owner.address)).lastActive;

    await networkHelpers.time.increase(60);
    await expect(willProtocol.ping()).to.emit(willProtocol, "Pinged");

    const after = (await willProtocol.wills(owner.address)).lastActive;
    expect(after).to.be.greaterThan(before);
  });

  it("ping reverts if no will exists", async function () {
    const { willProtocol, stranger } = await networkHelpers.loadFixture(deployWithWillFixture);
    await expect(willProtocol.connect(stranger).ping()).to.be.revertedWith(
      "No will exists for this address",
    );
  });

  it("updateNominee changes the nominee and emits NomineeUpdated", async function () {
    const { willProtocol, newNominee } = await networkHelpers.loadFixture(deployWithWillFixture);

    await expect(willProtocol.updateNominee(newNominee.address))
      .to.emit(willProtocol, "NomineeUpdated")
      .withArgs(await willProtocol.runner?.getAddress?.(), newNominee.address);

    const will = await willProtocol.wills(await willProtocol.runner!.getAddress!());
    expect(will.nominee).to.equal(newNominee.address);
  });

  it("cancelWill refunds the deposit and deletes the will", async function () {
  const { willProtocol, owner } = await networkHelpers.loadFixture(deployWithWillFixture);

  const balanceBefore = await ethers.provider.getBalance(owner.address);

  const tx = await willProtocol.cancelWill();
  const receipt = await tx.wait();
  const gasCost = receipt!.gasUsed * receipt!.gasPrice;

  const balanceAfter = await ethers.provider.getBalance(owner.address);

  expect(balanceAfter).to.equal(balanceBefore + ethers.parseEther("1.0") - gasCost);

  const will = await willProtocol.wills(owner.address);
  expect(will.exists).to.equal(false);
});

  it("cancelWill reverts if no will exists", async function () {
    const { willProtocol, stranger } = await networkHelpers.loadFixture(deployWithWillFixture);
    await expect(willProtocol.connect(stranger).cancelWill()).to.be.revertedWith(
      "No will exists for this address",
    );
  });
});