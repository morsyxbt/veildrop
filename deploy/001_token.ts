import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Deploys the demo confidential token used to showcase distributions.
// On a fresh chain this is the only contract we deploy — the TokenOps airdrop
// factory and disperse singleton are already live on Sepolia and are called
// through @tokenops/sdk.
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deploy } = hre.deployments;
  const { deployer } = await hre.getNamedAccounts();

  await deploy("ConfidentialToken", {
    from: deployer,
    args: ["Veildrop Demo USD", "vUSD", ""],
    log: true,
  });
};

export default func;
func.tags = ["Token"];
