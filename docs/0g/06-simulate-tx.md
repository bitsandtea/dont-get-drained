Simulation API
Transaction Simulation Types
Transaction Simulation Examples
Explore practical examples to help you get started with Alchemy's Simulation APIs.

You'll find some examples to get you started below!

You can also try out the APIs yourself using our API playgrounds directly:

alchemy_simulateAssetChanges
alchemy_simulateAssetChangesBundle
alchemy_simulateExecution
alchemy_simulateExecutionBundle
The examples below are for Eth Mainnet and Polygon Mainnet. Simulation also works on Arbitrum and testnets - more examples coming soon!


Ethereum

ETH - Transfer - simulateAssetChanges
0xbe0eb53f46cd790cd13851d5eff43d12404d33e8 sending 1 ETH to 0xc02aaa39b223fe8d050e5c4f27ead9083c756cc2.

To send a normal transfer, remove the data field from the transaction object in the request. We will add support for data: " " and data: "0x" soon.

Transaction
curl
Response

{
  "from": "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
  "to": "0xc02aaa39b223fe8d050e5c4f27ead9083c756cc2",
  "value": "0xDE0B6B3A7640000"
}

ETH - Transfer - simulateExecution
0xbe0eb53f46cd790cd13851d5eff43d12404d33e8 sending 1 ETH to 0xc02aaa39b223fe8d050e5c4f27ead9083c756cc2.

Transaction
curl
Response

{
	"from": "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
	"to": "0xc02aaa39b223fe8d050e5c4f27ead9083c756cc2",
	 "value": "0xDE0B6B3A7640000"
}

ERC20 - Transfer
vitalik.eth (0xf976d0d0464725157933d94E14Abe548aB5709B6) sending 1 USDC to demo.eth (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48).

Transaction
cURL
Response

{
   "from": "0xf976d0d0464725157933d94E14Abe548aB5709B6",
   "to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
   "value": "0x0",
   "data": "0xa9059cbb000000000000000000000000fc43f5f9dd45258b3aff31bdbe6561d97e8b71de00000000000000000000000000000000000000000000000000000000000f4240"
 }

WETH - Wrap
0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8 depositing 1 ETH and getting 1 WETH back.

Transaction
curl
Response

{
  "from": "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8",
  "to": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "data": "0xd0e30db0",
  "value": "0xDE0B6B3A7640000"
}

WETH - Unwrap
0x2e95E1cD077f29733C65D885Ce7AFE278d0726A6 withdrawing 1 ETH (1 WETH sent, 1 ETH returned).

Transaction
curl
Response

{
  "from": "0x2e95E1cD077f29733C65D885Ce7AFE278d0726A6",
  "to": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  "value": "0x0",
  "data": "0x2e1a7d4d0000000000000000000000000000000000000000000000000de0b6b3a7640000"
}

Polygon

MATIC - Transfer
0xe7804c37c13166ff0b37f5ae0bb07a3aebb6e245 sending 5 MATIC to 0x0d500b1d8e8ef31e21c99e1db9a6444d3adf1270.

To send a normal transfer, remove the data field from the transaction object in the request. We will add support for data: " " and data: "0x" soon.

Transaction
cURL
json

{
  "from": "0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245",
  "to": "0x0d500b1d8e8ef31e21c99e1db9a6444d3adf1270",
  "value": "0x4563918244F40000"
}

ERC20 - Transfer
0xf977814e90da44bfa03b6295a0616a897441acec sending 1 USDC to 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174.

Transaction
curl
Response

{
  "from": "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  "to": "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  "value": "0x0",
  "data": "0xa9059cbb000000000000000000000000fc43f5f9dd45258b3aff31bdbe6561d97e8b71de00000000000000000000000000000000000000000000000000000000000f4240"
}

WMATIC - Wrap
0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245 depositing 5 MATIC and getting 5 WMATIC back.

Transaction
cURL
Response

{
  "from": "0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245",
  "to": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  "data": "0xd0e30db0",
  "value": "0x4563918244F40000"
}

WMATIC - Unwrap
0xccc52f64ee0fff73ad7312825ee767ce94d4877a withdrawing 1 MATIC (1 WMATIC sent, 1 MATIC returned).

Transaction
curl
Response

{
  "from": "0xccc52f64ee0fff73ad7312825ee767ce94d4877a",
 	"to": "0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270",
  "value": "0x0",
  "data": "0x2e1a7d4d0000000000000000000000000000000000000000000000000de0b6b3a7640000"
}
Was this page helpful?
Yes
