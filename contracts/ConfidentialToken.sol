// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title ConfidentialToken — demo ERC-7984 confidential token for Veildrop.
/// @notice A Sepolia faucet token used to demonstrate confidential distribution.
///         Balances and transfer amounts are encrypted (euint64); the chain never
///         sees a cleartext amount. Anyone may mint to any address so reviewers can
///         play both the distributor and the recipient end to end.
///
///         Amounts follow the ERC-7984 6-decimal convention (1_000_000 = 1 token),
///         matching what the TokenOps SDK expects.
contract ConfidentialToken is ERC7984, ZamaEthereumConfig {
    constructor(
        string memory name_,
        string memory symbol_,
        string memory uri_
    ) ERC7984(name_, symbol_, uri_) {}

    /// @notice Mint demo tokens to `to`. Open by design — this is a testnet faucet.
    /// @param to recipient of the freshly minted confidential balance
    /// @param amount cleartext amount in 6-decimal units (gets encrypted on-chain)
    function mint(address to, uint64 amount) external {
        _mint(to, FHE.asEuint64(amount));
    }
}
