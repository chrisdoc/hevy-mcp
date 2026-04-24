"""
Nightly integration test for hevy-mcp using mcp-use.

This test installs hevy-mcp from npm and verifies:
1. The MCP server starts correctly
2. Tools are properly registered
3. A basic tool call works (get-workouts)
"""

import asyncio
import os
import sys

from mcp_use import MCPClient


async def main():
    api_key = os.environ.get("HEVY_API_KEY")
    if not api_key:
        print("❌ HEVY_API_KEY environment variable not set")
        sys.exit(1)

    print("🔧 Configuring hevy-mcp via npx...")

    config = {
        "mcpServers": {
            "hevy": {
                "command": "npx",
                "args": ["hevy-mcp"],
                "env": {"HEVY_API_KEY": api_key},
            }
        }
    }

    client = MCPClient.from_dict(config)

    try:
        print("🚀 Starting MCP session...")
        await client.create_all_sessions()

        session = client.get_session("hevy")
        if session is None:
            print("❌ Failed to create session")
            sys.exit(1)

        print("✅ Session created successfully")

        # List available tools
        print("📋 Listing available tools...")
        tools = await session.list_tools()
        tool_names = [tool.name for tool in tools]
        print(f"   Found {len(tool_names)} tools: {tool_names}")

        # Verify expected tools exist
        expected_tools = ["get-workouts", "get-routines", "get-exercise-templates"]
        missing_tools = [t for t in expected_tools if t not in tool_names]
        if missing_tools:
            print(f"❌ Missing expected tools: {missing_tools}")
            sys.exit(1)

        print("✅ All expected tools are registered")

        # Call get-workouts tool
        print("🏋️ Calling get-workouts tool...")
        result = await session.call_tool(
            name="get-workouts", arguments={"page": 1, "pageSize": 1}
        )

        if result.content:
            print(f"✅ get-workouts returned: {result.content[0].text[:200]}...")
        else:
            print(
                "⚠️ get-workouts returned empty content (may be expected if no workouts)"
            )

        print("\n🎉 All tests passed!")

    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        sys.exit(1)
    finally:
        await client.close_all_sessions()


if __name__ == "__main__":
    asyncio.run(main())
