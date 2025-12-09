"""
Nightly integration test for hevy-mcp using mcp-use.

This test installs hevy-mcp from npm and verifies:
1. The MCP server starts correctly
2. Tools are properly registered
3. A basic tool call works (get-workouts)
"""

import asyncio
import os
import subprocess
import sys

from mcp_use import MCPClient


def install_hevy_mcp():
    """Install hevy-mcp globally to ensure the command is available."""
    print("📦 Installing hevy-mcp from npm...")
    result = subprocess.run(
        ["npm", "install", "-g", "hevy-mcp"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"❌ Failed to install hevy-mcp: {result.stderr}")
        sys.exit(1)
    print("✅ hevy-mcp installed successfully")

    # Verify installation
    result = subprocess.run(["which", "hevy-mcp"], capture_output=True, text=True)
    if result.returncode != 0:
        print("❌ hevy-mcp command not found after installation")
        sys.exit(1)
    print(f"   Command location: {result.stdout.strip()}")


async def main():
    api_key = os.environ.get("HEVY_API_KEY")
    if not api_key:
        print("❌ HEVY_API_KEY environment variable not set")
        sys.exit(1)

    # Install hevy-mcp globally first
    install_hevy_mcp()

    print("🔧 Configuring hevy-mcp...")

    config = {
        "mcpServers": {
            "hevy": {
                "command": "hevy-mcp",
                "args": [],
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
