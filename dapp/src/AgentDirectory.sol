// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/// @title AgentDirectory — Marketplace registry for security agents
/// @notice Deploy on 0G testnet. Agents are prompt templates stored on 0G Storage.
contract AgentDirectory {
    struct Agent {
        bytes32 id;
        address creator;
        string name;
        string description;
        bytes32 promptCid;          // 0G Storage rootHash of the prompt template
        uint256 pricePerInference;  // wei, 0 = free
        string capabilities;       // comma-separated: "exploit-detection,simulation"
        bool active;
        uint256 totalInferences;
        uint256 createdAt;
    }

    mapping(bytes32 => Agent) public agents;
    bytes32[] public agentIds;
    mapping(address => bytes32[]) public creatorAgents;
    uint256 private _nonce;

    // --- Events ---

    event AgentRegistered(bytes32 indexed id, address indexed creator, string name, bytes32 promptCid);
    event AgentUpdated(bytes32 indexed id, bytes32 newPromptCid);
    event AgentDeactivated(bytes32 indexed id);
    event AgentPriceUpdated(bytes32 indexed id, uint256 newPrice);
    event InferenceRecorded(bytes32 indexed agentId, uint256 newTotal);

    // --- Errors ---

    error AgentNotFound();
    error NotCreator();
    error AgentInactive();

    // --- Write functions ---

    function registerAgent(
        string calldata name,
        string calldata description,
        bytes32 promptCid,
        uint256 pricePerInference,
        string calldata capabilities
    ) external returns (bytes32 id) {
        id = keccak256(abi.encodePacked(msg.sender, _nonce++));

        agents[id] = Agent({
            id: id,
            creator: msg.sender,
            name: name,
            description: description,
            promptCid: promptCid,
            pricePerInference: pricePerInference,
            capabilities: capabilities,
            active: true,
            totalInferences: 0,
            createdAt: block.timestamp
        });

        agentIds.push(id);
        creatorAgents[msg.sender].push(id);

        emit AgentRegistered(id, msg.sender, name, promptCid);
    }

    function updatePrompt(bytes32 agentId, bytes32 newPromptCid) external {
        Agent storage agent = agents[agentId];
        if (agent.creator == address(0)) revert AgentNotFound();
        if (agent.creator != msg.sender) revert NotCreator();

        agent.promptCid = newPromptCid;
        emit AgentUpdated(agentId, newPromptCid);
    }

    function deactivate(bytes32 agentId) external {
        Agent storage agent = agents[agentId];
        if (agent.creator == address(0)) revert AgentNotFound();
        if (agent.creator != msg.sender) revert NotCreator();

        agent.active = false;
        emit AgentDeactivated(agentId);
    }

    function setPrice(bytes32 agentId, uint256 newPrice) external {
        Agent storage agent = agents[agentId];
        if (agent.creator == address(0)) revert AgentNotFound();
        if (agent.creator != msg.sender) revert NotCreator();

        agent.pricePerInference = newPrice;
        emit AgentPriceUpdated(agentId, newPrice);
    }

    /// @notice Record that an inference was run for this agent (bookkeeping)
    function recordInference(bytes32 agentId) external {
        Agent storage agent = agents[agentId];
        if (agent.creator == address(0)) revert AgentNotFound();
        agent.totalInferences++;
        emit InferenceRecorded(agentId, agent.totalInferences);
    }

    // --- View functions ---

    function getAgent(bytes32 id) external view returns (Agent memory) {
        Agent memory agent = agents[id];
        if (agent.creator == address(0)) revert AgentNotFound();
        return agent;
    }

    function getAllAgents() external view returns (Agent[] memory) {
        Agent[] memory result = new Agent[](agentIds.length);
        for (uint256 i = 0; i < agentIds.length; i++) {
            result[i] = agents[agentIds[i]];
        }
        return result;
    }

    function getAgentsByCreator(address creator) external view returns (Agent[] memory) {
        bytes32[] memory ids = creatorAgents[creator];
        Agent[] memory result = new Agent[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            result[i] = agents[ids[i]];
        }
        return result;
    }

    function getAgentCount() external view returns (uint256) {
        return agentIds.length;
    }
}
