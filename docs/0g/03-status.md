# 0G Integration Status

## Completed

### Smart Contract Deployment (Foundry)
- Deployed MyToken contract to 0G Galileo testnet
- Location: `dapp/src/`, `dapp/script/`, `dapp/test/`
- Details: `docs/0g/01-how-to.md`

### AI Inference + Storage Pipeline
- Script that queries 0G Compute Network (Qwen 2.5 7B), fetches TEE proof, and stores the full result JSON (question, answer, verification, TEE signature) to 0G Storage
- Location: `dapp/0g-compute-ts-starter-kit/test-query.ts`
- Dependencies: `@0glabs/0g-serving-broker` (inference), `@0gfoundation/0g-ts-sdk` (storage)
- Network: testnet, wallet `0xf673b4DEe6880427b48832879Ed7b95BdCd8963C`

## Not Yet Done
- Wire storage root hash back into a smart contract (store on-chain reference to inference results)
- Mainnet deployment
