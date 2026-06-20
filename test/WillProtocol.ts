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