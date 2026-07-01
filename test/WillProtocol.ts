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
    ).to.be.revertedWithCustomError(willProtocol, "InsufficientDeposit");
  });

  it("reverts if nominee is the zero address", async function () {
    const { willProtocol } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      willProtocol.createWill(ethers.ZeroAddress, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      }),
    ).to.be.revertedWithCustomError(willProtocol, "InvalidNominee");
  });

  it("reverts if nominee is the sender", async function () {
    const { willProtocol, owner } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      willProtocol.createWill(owner.address, ONE_WEEK, {
        value: ethers.parseEther("1.0"),
      }),
    ).to.be.revertedWithCustomError(willProtocol, "InvalidNominee");
  });

  it("reverts if inactivity period is too short", async function () {
    const { willProtocol, nominee } = await networkHelpers.loadFixture(deployFixture);
    await expect(
      willProtocol.createWill(nominee.address, 60, { value: ethers.parseEther("1.0") }),
    ).to.be.revertedWithCustomError(willProtocol, "InactivityPeriodTooShort");
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
    ).to.be.revertedWithCustomError(willProtocol, "WillAlreadyExists");
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
    await expect(willProtocol.connect(stranger).ping()).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
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
    await expect(willProtocol.connect(stranger).cancelWill()).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
  });
});


describe("WillProtocol - claim", function () {
  async function deployWithWillFixture() {
    const willProtocol = await ethers.deployContract("WillProtocol");
    const [owner, nominee, stranger] = await ethers.getSigners();
    await willProtocol.createWill(nominee.address, ONE_WEEK, {
      value: ethers.parseEther("1.0"),
    });
    return { willProtocol, owner, nominee, stranger };
  }

  it("allows the nominee to claim after the inactivity period has passed", async function () {
    const { willProtocol, owner, nominee } = await networkHelpers.loadFixture(deployWithWillFixture);
    await networkHelpers.time.increase(ONE_WEEK + 1);

    const balanceBefore = await ethers.provider.getBalance(nominee.address);
    const tx = await willProtocol.connect(nominee).claim(owner.address);
    const receipt = await tx.wait();
    const gasCost = receipt!.gasUsed * receipt!.gasPrice;
    const balanceAfter = await ethers.provider.getBalance(nominee.address);

    expect(balanceAfter).to.equal(balanceBefore + ethers.parseEther("1.0") - gasCost);

    const will = await willProtocol.wills(owner.address);
    expect(will.exists).to.equal(false);
  });

  it("emits Claimed with correct args", async function () {
    const { willProtocol, owner, nominee } = await networkHelpers.loadFixture(deployWithWillFixture);
    await networkHelpers.time.increase(ONE_WEEK + 1);

    await expect(willProtocol.connect(nominee).claim(owner.address))
      .to.emit(willProtocol, "Claimed")
      .withArgs(owner.address, nominee.address, ethers.parseEther("1.0"));
  });

  it("reverts if the inactivity period has not passed", async function () {
    const { willProtocol, owner, nominee } = await networkHelpers.loadFixture(deployWithWillFixture);
    await expect(willProtocol.connect(nominee).claim(owner.address)).to.be.revertedWithCustomError(willProtocol, "StillActive");
  });

  it("reverts if called by someone other than the nominee", async function () {
    const { willProtocol, owner, stranger } = await networkHelpers.loadFixture(deployWithWillFixture);
    await networkHelpers.time.increase(ONE_WEEK + 1);
    await expect(willProtocol.connect(stranger).claim(owner.address)).to.be.revertedWithCustomError(willProtocol, "NotNominee");
  });

  it("reverts if no will exists for the given owner", async function () {
    const { willProtocol, nominee, stranger } = await networkHelpers.loadFixture(deployWithWillFixture);
    await expect(willProtocol.connect(nominee).claim(stranger.address)).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
  });

  it("reverts if the owner pinged before the deadline", async function () {
    const { willProtocol, owner, nominee } = await networkHelpers.loadFixture(deployWithWillFixture);
    await networkHelpers.time.increase(ONE_WEEK - 100);
    await willProtocol.ping();
    await networkHelpers.time.increase(200);

    await expect(willProtocol.connect(nominee).claim(owner.address)).to.be.revertedWithCustomError(willProtocol, "StillActive");
  });

  it("reverts on a second claim attempt after the will is deleted", async function () {
    const { willProtocol, owner, nominee } = await networkHelpers.loadFixture(deployWithWillFixture);
    await networkHelpers.time.increase(ONE_WEEK + 1);
    await willProtocol.connect(nominee).claim(owner.address);

    await expect(willProtocol.connect(nominee).claim(owner.address)).to.be.revertedWithCustomError(willProtocol, "WillDoesNotExist");
  });
});