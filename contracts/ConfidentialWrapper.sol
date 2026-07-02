// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {ERC7984ERC20Wrapper} from "@openzeppelin/confidential-contracts/token/ERC7984/extensions/ERC7984ERC20Wrapper.sol";

/// @title ConfidentialWrapper — turn any ERC-20 into a confidential ERC-7984 token.
/// @notice A thin, deployable concrete of OpenZeppelin's {ERC7984ERC20Wrapper}. Bind
///         it to an existing ERC-20 at deploy time; holders then `wrap` their public
///         ERC-20 balance into an encrypted (euint64) balance that Veildrop can
///         distribute privately, and `unwrap` back to the underlying ERC-20.
///
///         Amounts convert at a fixed `rate()` so the confidential side stays within
///         euint64 (confidential decimals are capped at 6); an 18-decimal token wraps
///         at rate 1e12. The chain never sees a cleartext confidential amount.
contract ConfidentialWrapper is ERC7984ERC20Wrapper, ZamaEthereumConfig {
    constructor(
        IERC20 underlying_,
        string memory name_,
        string memory symbol_,
        string memory uri_
    ) ERC7984(name_, symbol_, uri_) ERC7984ERC20Wrapper(underlying_) {}
}
