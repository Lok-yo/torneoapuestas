# Delta for Wallet Identity

## ADDED Requirements

### Requirement: Wallet Connection

The system MUST provide a wallet-connection layer built on wagmi/viem allowing a user to connect an EOA or smart-account wallet to interact with on-chain markets.

#### Scenario: User connects a wallet

- GIVEN a user with a supported browser wallet (e.g. MetaMask)
- WHEN they initiate connection through the wallet-connect UI
- THEN the app obtains the connected address and chain, ready for contract reads/writes

### Requirement: No Required GG2 Account for Trading

The system MUST allow any connected wallet to create markets, trade, and redeem positions without an existing GG2 (Supabase) account.

#### Scenario: Wallet-only trade with no GG2 account

- GIVEN a wallet with no linked GG2 profile
- WHEN it connects and submits a buy-shares transaction
- THEN the transaction is accepted on the same terms as a wallet with a linked profile

### Requirement: Optional 1:1 SIWE Linking

The system MAY allow a user to link exactly one wallet to their GG2 account via Sign-In With Ethereum (SIWE) signature verification, for social-surface features only (e.g. profile display, leaderboards). The system MUST NOT require this link for any trading action and MUST NOT allow one wallet to be linked to more than one GG2 account, nor one GG2 account to link more than one wallet at a time.

#### Scenario: User links a wallet via SIWE

- GIVEN an authenticated GG2 user with a connected wallet and no existing link
- WHEN the user completes a SIWE sign-in challenge with that wallet
- THEN the wallet address is recorded as linked 1:1 to the user's GG2 account

#### Scenario: Second wallet link rejected

- GIVEN a GG2 account already linked to wallet A
- WHEN the user attempts to link wallet B without first unlinking wallet A
- THEN the link attempt is rejected

### Requirement: On-Chain Sanctions Screening at Trade/Settle

The system MUST check every wallet address against an on-chain sanctions oracle at the time of trade (buy/create) and at settlement/redeem, and MUST reject the action if the address is flagged, independent of whether a GG2 account exists or IP-based geoblocking has already applied.

#### Scenario: Sanctioned address rejected at trade time

- GIVEN a wallet address flagged by the on-chain sanctions oracle
- WHEN that wallet attempts to buy shares or create a market
- THEN the transaction reverts before any funds move

#### Scenario: Sanctioned address rejected at redemption

- GIVEN a wallet address flagged by the on-chain sanctions oracle holding winning shares
- WHEN that wallet attempts to redeem
- THEN the redemption reverts
