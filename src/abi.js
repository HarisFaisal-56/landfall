import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

// Agora's AUSD faucet (ABI from github.com/agora-finance/stable-swap-examples).
// The drip limit is global: one request per maxDripFrequency seconds across everyone.
export const faucetAbi = parseAbi([
  "function requestFunds(address _receiver)",
  "function lastDripTimestamp() view returns (uint256)",
  "function maxDripFrequency() view returns (uint256)",
  "error MaxFrequencyExceeded()",
  "error MaxAllowedExceeded()",
  "error InsufficientFunds()",
]);

// Subset of Agora's AgoraStableSwap pair ABI (github.com/agora-finance/stable-swap-examples).
// Roles are plain strings on this contract, e.g. hasRole("APPROVED_SWAPPER", addr).
export const pairAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function isPaused() view returns (bool)",
  "function hasRole(string _role, address _address) view returns (bool)",
  "function getAmountsOut(uint256 _amountIn, address[] _path) view returns (uint256[])",
  "function swapExactTokensForTokens(uint256 _amountIn, uint256 _amountOutMin, address[] _path, address _to, uint256 _deadline) returns (uint256[])",
]);
