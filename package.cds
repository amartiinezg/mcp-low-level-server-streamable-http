{
  "name": "mcp-cap-integration",
  "version": "1.0.0",
  "description": "CAP application integrated with MCP Server",
  "repository": "<Add your repository here>",
  "license": "UNLICENSED",
  "private": true,
  "dependencies": {
    "@sap/cds": "^8",
    "express": "^4"
  },
  "devDependencies": {
    "@cap-js/sqlite": "^1"
  },
  "scripts": {
    "start": "cds-serve"
  },
  "cds": {
    "requires": {
      "db": "sql"
    }
  }
}
