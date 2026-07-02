// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DemoERC20 — a plain, openly-mintable ERC-20 for trying the wrapper.
/// @notice Testnet convenience so reviewers have a public ERC-20 to convert into a
///         confidential token on the Create page. Decimals are configurable at deploy
///         time; `mint` is open by design (testnet faucet).
contract DemoERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint public ERC-20 tokens to `to`. Open by design — this is a testnet faucet token.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
