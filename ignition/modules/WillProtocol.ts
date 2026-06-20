import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("WillProtocolModule", (m) => {
  const willProtocol = m.contract("WillProtocol");
  return { willProtocol };
});