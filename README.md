[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/chrisdoc-hevy-mcp-badge.png)](https://mseep.ai/app/chrisdoc-hevy-mcp)

# hevy-mcp: Model Context Protocol Server for Hevy Fitness API

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![smithery badge](https://smithery.ai/badge/@chrisdoc/hevy-mcp)](https://smithery.ai/server/@chrisdoc/hevy-mcp)

A Model Context Protocol (MCP) server implementation that interfaces with the [Hevy fitness tracking app](https://www.hevyapp.com/) and its [API](https://api.hevyapp.com/docs/). This server enables AI assistants to access and manage workout data, routines, exercise templates, and more through the Hevy API (requires PRO subscription).

## Features

- **Workout Management**: Fetch, create, and update workouts
- **Routine Management**: Access and manage workout routines
- **Exercise Templates**: Browse available exercise templates
- **Folder Organization**: Manage routine folders

## Prerequisites

- Node.js (v20 or higher)
- npm or yarn
- A Hevy API key

## Installation

### Installing via Smithery

To install hevy-mcp for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@chrisdoc/hevy-mcp):

```bash
npx -y @smithery/cli install @chrisdoc/hevy-mcp --client claude
```

### Manual Installation
```bash
# Clone the repository
git clone https://github.com/chrisdoc/hevy-mcp.git
cd hevy-mcp

# Install dependencies
npm install

# Create .env file from sample
cp .env.sample .env
# Edit .env and add your Hevy API key
```

### Integration with Cursor

To use this MCP server with Cursor, you need to update your `~/.cursor/mcp.json` file by adding the following configuration:

```json
{
  "hevy-mcp-server": {
    "command": "npx",
    "args": ["-y", "hevy-mcp"],
    "env": {
      "HEVY_API_KEY": "your-api-key-here"
    }
  }
}
```

Make sure to replace `your-api-key-here` with your actual Hevy API key.


## Configuration

Create a `.env` file in the project root with the following content:

```
HEVY_API_KEY=your_hevy_api_key_here
```

Replace `your_hevy_api_key_here` with your actual Hevy API key.

## Usage

### Development

```bash
npm run dev
```

This starts the MCP server in development mode with hot reloading.

### Production

```bash
npm run build
npm start
```

## Available MCP Tools

The server implements the following MCP tools:

### Workout Tools
- `get-workouts`: Fetch and format workout data
- `get-workout`: Get a single workout by ID
- `create-workout`: Create a new workout
- `update-workout`: Update an existing workout
- `get-workout-count`: Get the total count of workouts
- `get-workout-events`: Get workout update/delete events

### Routine Tools
- `get-routines`: Fetch and format routine data
- `create-routine`: Create a new routine
- `update-routine`: Update an existing routine
- `get-routine`: Get a single routine by ID

### Exercise Template Tools
- `get-exercise-templates`: Fetch exercise templates
- `get-exercise-template`: Get a template by ID

### Routine Folder Tools
- `get-routine-folders`: Fetch routine folders
- `create-routine-folder`: Create a new folder
- `get-routine-folder`: Get a folder by ID

## Project Structure

```
hevy-mcp/
├── .env                   # Environment variables (API keys)
├── src/
│   ├── index.ts           # Main entry point
│   ├── tools/             # Directory for MCP tool implementations
│   │   ├── workouts.ts    # Workout-related tools
│   │   ├── routines.ts    # Routine-related tools
│   │   ├── templates.ts   # Exercise template tools
│   │   └── folders.ts     # Routine folder tools
│   ├── generated/         # API client (generated code)
│   │   ├── client/        # Kiota-generated client
│   └── utils/             # Helper utilities
│       ├── formatters.ts  # Data formatting helpers
│       └── validators.ts  # Input validation helpers
├── scripts/               # Build and utility scripts
└── tests/                 # Test suite
```

## Development

### Code Style

This project uses Biome for code formatting and linting:

```bash
npm run check
```

### Generating API Client

The API client is generated from the OpenAPI specification using Kiota:

```bash
npm run export-specs
npm run build:client
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgements

- [Model Context Protocol](https://github.com/modelcontextprotocol) for the MCP SDK
- [Hevy](https://www.hevyapp.com/) for their fitness tracking platform and API
