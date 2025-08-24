import { spawn } from 'child_process';
import { promises as fs, existsSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Self-Hosted Serverless Function Handler for MCP
 * 
 * This class provides serverless function capabilities for self-hosted Supabase
 * instances without requiring Management API tokens. It handles function
 * deployment, storage, and execution using Deno runtime.
 */
export class ServerlessFunctionHandler {
  private functions: Map<string, DeployedFunction> = new Map();
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'mcp-supabase-functions');
    this.initializeTempDir();
  }

  /**
   * Initialize temporary directory for function storage
   */
  private async initializeTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.warn('Could not create temp directory:', error);
    }
  }

  /**
   * Deploy a function to the local serverless handler
   */
  async deployFunction(
    functionName: string,
    functionCode: string,
    importMap: Record<string, any> = {}
  ): Promise<DeploymentResult> {
    try {
      // Validate function name
      if (!this.isValidFunctionName(functionName)) {
        throw new Error('Invalid function name. Use only letters, numbers, and hyphens.');
      }

      // Validate function code
      this.validateFunctionCode(functionCode);

      // Create function directory
      const functionDir = path.join(this.tempDir, functionName);
      await fs.mkdir(functionDir, { recursive: true });

      // Write function file
      const functionFile = path.join(functionDir, 'index.ts');
      const wrappedCode = this.wrapFunctionCode(functionCode, importMap);
      await fs.writeFile(functionFile, wrappedCode, 'utf-8');

      // Write import map if provided
      if (Object.keys(importMap).length > 0) {
        const importMapFile = path.join(functionDir, 'import-map.json');
        await fs.writeFile(importMapFile, JSON.stringify(importMap, null, 2));
      }

      // Store function metadata
      const deployedFunction: DeployedFunction = {
        name: functionName,
        code: functionCode,
        importMap,
        deployedAt: new Date(),
        filePath: functionFile,
        directory: functionDir,
        status: 'deployed',
      };

      this.functions.set(functionName, deployedFunction);

      return {
        success: true,
        functionName,
        message: `Function '${functionName}' deployed successfully to local handler`,
        deployedAt: deployedFunction.deployedAt,
        functionUrl: `/functions/v1/${functionName}`,
        executionRuntime: 'deno',
      };
    } catch (error) {
      return {
        success: false,
        functionName,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute a deployed function with given payload
   */
  async executeFunction(
    functionName: string,
    payload: any = {},
    headers: Record<string, string> = {}
  ): Promise<ExecutionResult> {
    const deployedFunction = this.functions.get(functionName);

    if (!deployedFunction) {
      return {
        success: false,
        functionName,
        error: `Function '${functionName}' not found. Deploy it first using deployFunction().`,
        availableFunctions: Array.from(this.functions.keys()),
      };
    }

    try {
      // Prepare request data
      const requestData = {
        method: 'POST',
        url: `/functions/v1/${functionName}`,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: payload,
      };

      // Execute function using Deno
      const result = await this.executeWithDeno(deployedFunction, requestData);
      
      return {
        success: true,
        functionName,
        data: result.data,
        statusCode: result.statusCode,
        executionTime: result.executionTime,
        runtime: 'deno',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        functionName,
        error: error instanceof Error ? error.message : String(error),
        runtime: 'deno',
        timestamp: new Date(),
      };
    }
  }

  /**
   * List all deployed functions
   */
  listFunctions(): FunctionSummary[] {
    return Array.from(this.functions.values()).map(func => ({
      name: func.name,
      deployedAt: func.deployedAt,
      status: func.status,
      hasImportMap: Object.keys(func.importMap).length > 0,
      codeLength: func.code.length,
    }));
  }

  /**
   * Remove a deployed function
   */
  async removeFunction(functionName: string): Promise<boolean> {
    const deployedFunction = this.functions.get(functionName);
    
    if (!deployedFunction) {
      return false;
    }

    try {
      // Remove function files
      await fs.rm(deployedFunction.directory, { recursive: true, force: true });
      
      // Remove from registry
      this.functions.delete(functionName);
      
      return true;
    } catch (error) {
      console.warn(`Could not remove function files for '${functionName}':`, error);
      // Still remove from registry even if file cleanup fails
      this.functions.delete(functionName);
      return true;
    }
  }

  /**
   * Get function details
   */
  getFunctionDetails(functionName: string): DeployedFunction | null {
    return this.functions.get(functionName) || null;
  }

  /**
   * Execute function using Deno subprocess
   */
  private async executeWithDeno(
    func: DeployedFunction,
    requestData: any
  ): Promise<{ data: any; statusCode: number; executionTime: number }> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const args = [
        'run',
        '--allow-all',
        '--unstable',
        func.filePath,
      ];

      // Add import map if exists
      const importMapFile = path.join(func.directory, 'import-map.json');
      if (existsSync(importMapFile)) {
        args.splice(2, 0, `--import-map=${importMapFile}`);
      }

      const deno = spawn('deno', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      deno.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      deno.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      deno.on('close', (code) => {
        const executionTime = Date.now() - startTime;

        if (code !== 0) {
          reject(new Error(`Function execution failed: ${stderr || stdout}`));
          return;
        }

        try {
          // Parse function response
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          
          let responseData;
          try {
            responseData = JSON.parse(lastLine);
          } catch {
            responseData = lastLine;
          }

          resolve({
            data: responseData,
            statusCode: 200,
            executionTime,
          });
        } catch (error) {
          reject(new Error(`Failed to parse function response: ${error}`));
        }
      });

      deno.on('error', (error) => {
        reject(new Error(`Failed to start Deno process: ${error.message}`));
      });

      // Send request data to function
      deno.stdin.write(JSON.stringify(requestData));
      deno.stdin.end();
    });
  }

  /**
   * Wrap function code with proper Deno HTTP server setup
   */
  private wrapFunctionCode(functionCode: string, importMap: Record<string, any>): string {
    return `
// Auto-generated wrapper for MCP Serverless Function Handler
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

${functionCode}

// Auto-generated request handler
const requestData = JSON.parse(await new TextDecoder().decode(await Deno.readAll(Deno.stdin)));

try {
  const request = new Request(requestData.url, {
    method: requestData.method,
    headers: new Headers(requestData.headers),
    body: requestData.method !== 'GET' ? JSON.stringify(requestData.body) : undefined,
  });

  // Call the exported function
  let handler = globalThis.default;
  if (!handler && globalThis.serve) {
    // If using serve pattern, extract the handler
    handler = serve;
  }

  const response = await handler(request);
  const responseText = await response.text();
  
  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    result = responseText;
  }
  
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({
    error: error.message,
    stack: error.stack,
  }));
  Deno.exit(1);
}
`;
  }

  /**
   * Validate function name format
   */
  private isValidFunctionName(name: string): boolean {
    return /^[a-z0-9-]+$/.test(name) && name.length >= 1 && name.length <= 50;
  }

  /**
   * Basic function code validation
   */
  private validateFunctionCode(code: string): void {
    if (!code.trim()) {
      throw new Error('Function code cannot be empty');
    }

    if (code.length > 50000) {
      throw new Error('Function code too large (max 50KB)');
    }

    // Check for basic TypeScript/JavaScript patterns
    if (!code.includes('export') && !code.includes('function') && !code.includes('serve')) {
      console.warn('Function code should export a handler or use serve() pattern');
    }
  }
}

// Type definitions
export interface DeployedFunction {
  name: string;
  code: string;
  importMap: Record<string, any>;
  deployedAt: Date;
  filePath: string;
  directory: string;
  status: 'deployed' | 'error';
}

export interface DeploymentResult {
  success: boolean;
  functionName: string;
  message?: string;
  error?: string;
  deployedAt?: Date;
  functionUrl?: string;
  executionRuntime?: string;
}

export interface ExecutionResult {
  success: boolean;
  functionName: string;
  data?: any;
  error?: string;
  statusCode?: number;
  executionTime?: number;
  runtime?: string;
  timestamp?: Date;
  availableFunctions?: string[];
}

export interface FunctionSummary {
  name: string;
  deployedAt: Date;
  status: string;
  hasImportMap: boolean;
  codeLength: number;
}
