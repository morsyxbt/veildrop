// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";

/// @title ConfidentialMintableToken — an owner-minted confidential ERC-7984 token.
/// @notice Deployed from the Veildrop "Create new" flow. Only the deployer (owner)
///         can mint, so it behaves like a real project token rather than an open
///         faucet. Balances stay encrypted (euint64, 6-decimal convention).
///
///         An optional public `cap` bounds the total supply. The cap and the running
///         `totalMinted` are cleartext (a max supply is inherently public); only the
///         individual balances and transfer amounts remain confidential.
contract ConfidentialMintableToken is ERC7984, ZamaEthereumConfig, Ownable {
    /// @notice Optional max supply in 6-decimal units. 0 means uncapped.
    uint64 public immutable cap;
    /// @notice Total amount minted so far (6-decimal units), used to enforce the cap.
    uint64 public totalMinted;

    /// @dev A mint would push `totalMinted` past the (non-zero) `cap`.
    error CapExceeded();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory uri_,
        uint64 cap_
    ) ERC7984(name_, symbol_, uri_) Ownable(msg.sender) {
        cap = cap_;
    }

    /// @notice Mint `amount` (6-decimal units) of confidential tokens to `to`. Owner only.
    /// @dev The amount is public calldata by design (the deployer's mints are not
    ///      secret); it becomes an encrypted balance the moment it is stored.
    /// @param to Recipient of the newly minted confidential balance.
    /// @param amount Amount to mint, in 6-decimal units. Reverts with {CapExceeded}
    ///        if a non-zero cap would be exceeded.
    function mint(address to, uint64 amount) external onlyOwner {
        uint64 minted = totalMinted + amount;
        if (cap != 0 && minted > cap) revert CapExceeded();
        totalMinted = minted;
        _mint(to, FHE.asEuint64(amount));
    }
}
