"""
Nightly integration test for hevy-mcp using mcp-use.

This test installs the published hevy-mcp package from npm and verifies:
1. The MCP server starts correctly
2. Tools are properly registered
3. A basic tool call works (get-workouts)
"""

import asyncio
import json
import os
import sys

from mcp_use import MCPClient


DEFAULT_HEVY_MCP_COMMAND = "npx"
DEFAULT_HEVY_MCP_ARGS_JSON = '["-y", "hevy-mcp@latest"]'


def get_launcher_config() -> tuple[str, list[str]]:
    command = os.environ.get("HEVY_MCP_COMMAND", DEFAULT_HEVY_MCP_COMMAND).strip()
    if not command:
        print("❌ HEVY_MCP_COMMAND cannot be empty")
        print("   Example: HEVY_MCP_COMMAND=npx")
        sys.exit(1)

    args_json = os.environ.get("HEVY_MCP_ARGS_JSON", DEFAULT_HEVY_MCP_ARGS_JSON)

    try:
        parsed_args = json.loads(args_json)
    except json.JSONDecodeError as exc:
        print("❌ HEVY_MCP_ARGS_JSON must be valid JSON")
        print("   Expected: a JSON array of strings")
        print(f"   Received: {args_json!r}")
        print(
            "   Parse error:"
            f" line {exc.lineno}, column {exc.colno}: {exc.msg}"
        )
        print(
            "   Example:"
            f" HEVY_MCP_ARGS_JSON='{DEFAULT_HEVY_MCP_ARGS_JSON}'"
        )
        sys.exit(1)

    if not isinstance(parsed_args, list):
        print("❌ HEVY_MCP_ARGS_JSON must decode to a JSON array")
        print(f"   Received type: {type(parsed_args).__name__}")
        print(
            "   Example:"
            f" HEVY_MCP_ARGS_JSON='{DEFAULT_HEVY_MCP_ARGS_JSON}'"
        )
        sys.exit(1)

    invalid_arg_indexes = [
        index for index, arg in enumerate(parsed_args) if not isinstance(arg, str)
    ]
    if invalid_arg_indexes:
        print("❌ HEVY_MCP_ARGS_JSON must contain only string arguments")
        print(f"   Invalid index(es): {invalid_arg_indexes}")
        print(f"   Received value: {parsed_args!r}")
        sys.exit(1)

    if not parsed_args:
        print("❌ HEVY_MCP_ARGS_JSON cannot be an empty array")
        print(f"   Example: {DEFAULT_HEVY_MCP_ARGS_JSON}")
        sys.exit(1)

    return command, parsed_args


async def main():
    api_key = os.environ.get("HEVY_API_KEY")
    if not api_key:
        print("❌ HEVY_API_KEY environment variable not set")
        sys.exit(1)

    launcher_command, launcher_args = get_launcher_config()
    print(
        "🔧 Configuring hevy-mcp launcher:"
        f" command={launcher_command!r} args={launcher_args!r}"
    )

    config = {
        "mcpServers": {
            "hevy": {
                "command": launcher_command,
                "args": launcher_args,
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
