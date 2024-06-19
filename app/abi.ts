
export const ERC20_TOKEN_BALANCEOF_ABI = [
  {
      "constant": true,
      "inputs": [
          {
              "name": "_owner",
              "type": "address"
          }
      ],
      "name": "balanceOf",
      "outputs": [
          {
              "name": "balance",
              "type": "uint256"
          }
      ],
      "payable": false,
      "stateMutability": "view",
      "type": "function"
  },
];

export const ERC20_TOKEN_MINT_ABI = [
  {
      "inputs":[
         {
            "internalType":"address",
            "name":"to",
            "type":"address"
         },
         {
            "internalType":"uint256",
            "name":"amount",
            "type":"uint256"
         }
      ],
      "name":"mint",
      "outputs":[
         
      ],
      "stateMutability":"nonpayable",
      "type":"function"
   }
];

export const ERC20_TOKEN_TRANSFER_ABI = [
  {
    inputs: [
      { name: "_to", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
];

export const ERC20_TOKEN_APPROVE_ABI = [
  {
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    payable: false,
    stateMutability: "nonpayable",
    type: "function",
  },
];

export const ERC20_TOKEN_ALLOWANCE_ABI = [
  {
      inputs:[
          {
              internalType: "address",
              name: "owner",
              type: "address"
          },
          {
              internalType: "address",
              name: "spender",
              type: "address"
          }
      ],
      name: "allowance",
      outputs: [
          {
              internalType: "uint256",
              name: "",
              type: "uint256"
          }
      ],
      stateMutability: "view",
      type: "function"
  }
];
