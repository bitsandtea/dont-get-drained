// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/AgentDirectory.sol";

contract AgentDirectoryTest is Test {
    AgentDirectory directory;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        directory = new AgentDirectory();
    }

    // --- registerAgent ---

    function test_RegisterAgent() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent(
            "ExploitDetector",
            "Detects reentrancy and flash-loan exploits",
            bytes32(uint256(0xcafe)),
            0.001 ether,
            "exploit-detection,simulation"
        );

        AgentDirectory.Agent memory agent = directory.getAgent(id);
        assertEq(agent.creator, alice);
        assertEq(agent.name, "ExploitDetector");
        assertEq(agent.promptCid, bytes32(uint256(0xcafe)));
        assertEq(agent.pricePerInference, 0.001 ether);
        assertTrue(agent.active);
        assertEq(agent.totalInferences, 0);
        assertEq(directory.getAgentCount(), 1);
    }

    function test_RegisterMultipleAgents() public {
        vm.startPrank(alice);
        directory.registerAgent("Agent1", "desc1", bytes32(uint256(1)), 0, "cap1");
        directory.registerAgent("Agent2", "desc2", bytes32(uint256(2)), 0, "cap2");
        vm.stopPrank();

        vm.prank(bob);
        directory.registerAgent("Agent3", "desc3", bytes32(uint256(3)), 0, "cap3");

        assertEq(directory.getAgentCount(), 3);

        AgentDirectory.Agent[] memory allAgents = directory.getAllAgents();
        assertEq(allAgents.length, 3);

        AgentDirectory.Agent[] memory aliceAgents = directory.getAgentsByCreator(alice);
        assertEq(aliceAgents.length, 2);

        AgentDirectory.Agent[] memory bobAgents = directory.getAgentsByCreator(bob);
        assertEq(bobAgents.length, 1);
    }

    // --- updatePrompt ---

    function test_UpdatePrompt() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent("A", "d", bytes32(uint256(1)), 0, "c");

        bytes32 newCid = bytes32(uint256(0xbeef));
        vm.prank(alice);
        directory.updatePrompt(id, newCid);

        AgentDirectory.Agent memory agent = directory.getAgent(id);
        assertEq(agent.promptCid, newCid);
    }

    function test_UpdatePrompt_RevertNotCreator() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent("A", "d", bytes32(uint256(1)), 0, "c");

        vm.prank(bob);
        vm.expectRevert(AgentDirectory.NotCreator.selector);
        directory.updatePrompt(id, bytes32(uint256(0xbeef)));
    }

    function test_UpdatePrompt_RevertNotFound() public {
        vm.prank(alice);
        vm.expectRevert(AgentDirectory.AgentNotFound.selector);
        directory.updatePrompt(bytes32(uint256(0xdead)), bytes32(uint256(0xbeef)));
    }

    // --- deactivate ---

    function test_Deactivate() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent("A", "d", bytes32(uint256(1)), 0, "c");

        vm.prank(alice);
        directory.deactivate(id);

        AgentDirectory.Agent memory agent = directory.getAgent(id);
        assertFalse(agent.active);
    }

    function test_Deactivate_RevertNotCreator() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent("A", "d", bytes32(uint256(1)), 0, "c");

        vm.prank(bob);
        vm.expectRevert(AgentDirectory.NotCreator.selector);
        directory.deactivate(id);
    }

    // --- setPrice ---

    function test_SetPrice() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent("A", "d", bytes32(uint256(1)), 0.001 ether, "c");

        vm.prank(alice);
        directory.setPrice(id, 0.005 ether);

        AgentDirectory.Agent memory agent = directory.getAgent(id);
        assertEq(agent.pricePerInference, 0.005 ether);
    }

    function test_SetPrice_RevertNotCreator() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent("A", "d", bytes32(uint256(1)), 0.001 ether, "c");

        vm.prank(bob);
        vm.expectRevert(AgentDirectory.NotCreator.selector);
        directory.setPrice(id, 0);
    }

    // --- recordInference ---

    function test_RecordInference() public {
        vm.prank(alice);
        bytes32 id = directory.registerAgent("A", "d", bytes32(uint256(1)), 0, "c");

        directory.recordInference(id);
        directory.recordInference(id);
        directory.recordInference(id);

        AgentDirectory.Agent memory agent = directory.getAgent(id);
        assertEq(agent.totalInferences, 3);
    }

    function test_RecordInference_RevertNotFound() public {
        vm.expectRevert(AgentDirectory.AgentNotFound.selector);
        directory.recordInference(bytes32(uint256(0xdead)));
    }

    // --- getAgent revert ---

    function test_GetAgent_RevertNotFound() public {
        vm.expectRevert(AgentDirectory.AgentNotFound.selector);
        directory.getAgent(bytes32(uint256(0xdead)));
    }

    // --- events ---

    event AgentRegistered(bytes32 indexed id, address indexed creator, string name, bytes32 promptCid);

    function test_EmitsAgentRegistered() public {
        vm.prank(alice);
        vm.expectEmit(false, true, false, true);
        emit AgentRegistered(bytes32(0), alice, "A", bytes32(uint256(1)));
        directory.registerAgent("A", "d", bytes32(uint256(1)), 0, "c");
    }
}
