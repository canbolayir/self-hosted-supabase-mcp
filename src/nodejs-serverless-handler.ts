import { createContext, runInContext, Script } from 'vm';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { promises as fs, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

/**
 * Node.js Serverless Function Handler for MCP
 * 
 * This class provides serverless function capabilities using Node.js VM module
 * for safe code execution without external dependencies like Deno.
 */
export class NodeJSServerlessHandler {
  private functions: Map<string, NodeJSDeployedFunction> = new Map();
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'mcp-nodejs-functions');
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
   * Deploy a function to the local Node.js serverless handler
   */
  async deployFunction(
    functionName: string,
    functionCode: string,
    importMap: Record<string, any> = {}
  ): Promise<NodeJSDeploymentResult> {
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

      // Transform function code for Node.js execution
      const wrappedCode = this.wrapFunctionForNodeJS(functionCode, importMap);
      
      // Save function metadata
      const deployedFunction: NodeJSDeployedFunction = {
        name: functionName,
        originalCode: functionCode,
        wrappedCode: wrappedCode,
        importMap,
        deployedAt: new Date(),
        directory: functionDir,
        status: 'deployed',
        compiledScript: new Script(wrappedCode, { filename: `${functionName}.js` }),
      };

      this.functions.set(functionName, deployedFunction);

      return {
        success: true,
        functionName,
        message: `Function '${functionName}' deployed successfully to Node.js handler`,
        deployedAt: deployedFunction.deployedAt,
        functionUrl: `/functions/v1/${functionName}`,
        executionRuntime: 'nodejs',
        codeLength: functionCode.length,
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
  ): Promise<NodeJSExecutionResult> {
    const deployedFunction = this.functions.get(functionName);

    if (!deployedFunction) {
      return {
        success: false,
        functionName,
        error: `Function '${functionName}' not found. Deploy it first using deployFunction().`,
        availableFunctions: Array.from(this.functions.keys()),
        runtime: 'nodejs',
        timestamp: new Date(),
      };
    }

    try {
      const startTime = Date.now();

      // Create HTTP-like request/response objects
      const mockRequest = this.createMockRequest(functionName, payload, headers);
      const mockResponse = this.createMockResponse();

      // Create isolated execution context
      const context = this.createExecutionContext(mockRequest, mockResponse);

      // Execute function in VM
      const result = await this.executeInVM(deployedFunction, context);
      
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        functionName,
        data: result,
        statusCode: 200,
        executionTime,
        runtime: 'nodejs',
        timestamp: new Date(),
        headers: mockResponse.getHeaders(),
      };
    } catch (error) {
      return {
        success: false,
        functionName,
        error: error instanceof Error ? error.message : String(error),
        runtime: 'nodejs',
        timestamp: new Date(),
      };
    }
  }

  /**
   * List all deployed functions
   */
  listFunctions(): NodeJSFunctionSummary[] {
    return Array.from(this.functions.values()).map(func => ({
      name: func.name,
      deployedAt: func.deployedAt,
      status: func.status,
      hasImportMap: Object.keys(func.importMap).length > 0,
      codeLength: func.originalCode.length,
      runtime: 'nodejs',
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
      // Remove function directory
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
  getFunctionDetails(functionName: string): NodeJSDeployedFunction | null {
    return this.functions.get(functionName) || null;
  }

  /**
   * Create mock HTTP request object
   */
  private createMockRequest(functionName: string, payload: any, headers: Record<string, string>) {
    return {
      method: 'POST',
      url: `/functions/v1/${functionName}`,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: payload,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      // Add standard Request methods
      clone: () => this.createMockRequest(functionName, payload, headers),
    };
  }

  /**
   * Create mock HTTP response object
   */
  private createMockResponse() {
    let responseData: any;
    let statusCode = 200;
    const responseHeaders: Record<string, string> = {};

    return {
      statusCode,
      headers: responseHeaders,
      json: (data: any) => {
        responseData = data;
        responseHeaders['content-type'] = 'application/json';
        return { statusCode, headers: responseHeaders, data };
      },
      text: (data: string) => {
        responseData = data;
        responseHeaders['content-type'] = 'text/plain';
        return { statusCode, headers: responseHeaders, data };
      },
      status: (code: number) => {
        statusCode = code;
        return { statusCode, headers: responseHeaders };
      },
      setHeader: (name: string, value: string) => {
        responseHeaders[name.toLowerCase()] = value;
      },
      getHeaders: () => ({ ...responseHeaders }),
      getData: () => responseData,
      getStatusCode: () => statusCode,
    };
  }

  /**
   * Create execution context for VM
   */
  private createExecutionContext(request: any, response: any) {
    return createContext({
      // Standard globals
      console: console,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      
      // Request/Response objects
      req: request,
      request: request,
      res: response,
      response: response,
      
      // Standard Node.js globals
      process: {
        env: process.env,
        version: process.version,
        platform: process.platform,
      },
      
      // JSON utilities
      JSON: JSON,
      
      // Date and Math
      Date: Date,
      Math: Math,
      
      // Common utilities
      Buffer: Buffer,
      
      // Module system (restricted)
      require: (moduleName: string) => {
        // Allow only safe modules
        const allowedModules = ['crypto', 'util', 'url', 'querystring'];
        if (allowedModules.includes(moduleName)) {
          return require(moduleName);
        }
        throw new Error(`Module '${moduleName}' is not allowed in serverless functions`);
      },
      
      // Function response helpers
      Response: class MockResponse {
        constructor(body?: any, init?: { status?: number; headers?: Record<string, string> }) {
          this.body = body;
          this.status = init?.status || 200;
          this.headers = init?.headers || {};
        }
        
        body: any;
        status: number;
        headers: Record<string, string>;
        
        async json() {
          return typeof this.body === 'string' ? JSON.parse(this.body) : this.body;
        }
        
        async text() {
          return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
        }
      },
    });
  }

  /**
   * Execute function in VM sandbox
   */
  private async executeInVM(func: NodeJSDeployedFunction, context: any): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // Execute the compiled script
        const result = func.compiledScript.runInContext(context, {
          timeout: 30000, // 30 second timeout
          displayErrors: true,
        });

        // If result is a Promise, wait for it
        if (result && typeof result.then === 'function') {
          result
            .then((asyncResult: any) => {
              resolve(this.extractResponseData(asyncResult, context));
            })
            .catch(reject);
        } else {
          resolve(this.extractResponseData(result, context));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Extract response data from function execution
   */
  private extractResponseData(result: any, context: any): any {
    // If result is a Response object
    if (result && result.body !== undefined && result.status !== undefined) {
      return {
        data: result.body,
        status: result.status,
        headers: result.headers || {},
      };
    }

    // If response was set via context.response
    const responseData = context.res?.getData?.();
    if (responseData !== undefined) {
      return {
        data: responseData,
        status: context.res.getStatusCode(),
        headers: context.res.getHeaders(),
      };
    }

    // Return direct result
    return result;
  }

  /**
   * Wrap function code for Node.js execution
   */
  private wrapFunctionForNodeJS(functionCode: string, importMap: Record<string, any>): string {
    // Detect function pattern
    const codeLines = functionCode.trim().split('\n');
    const lastLine = codeLines[codeLines.length - 1].trim();
    
    // If the last line is just a function name (our working pattern)
    if (lastLine && !lastLine.includes('(') && !lastLine.includes('{') && !lastLine.includes(';')) {
      const functionName = lastLine;
      return `
// Auto-generated wrapper for Node.js Serverless Function Handler  
(function() {
  try {
    ${functionCode}
    
    // Call the function directly by name
    if (typeof ${functionName} === 'function') {
      const result = ${functionName}(request);
      return result;
    } else {
      throw new Error('Function ${functionName} is not defined or not a function');
    }
  } catch (error) {
    throw new Error('Function execution failed: ' + error.message);
  }
})();
`;
    }

    // For other patterns, try more comprehensive detection
    return `
// Auto-generated wrapper for Node.js Serverless Function Handler
(async function() {
  try {
    // Set up module-like environment
    var module = { exports: {} };
    var exports = module.exports;
    
    ${functionCode}
    
    // Auto-detect export pattern and call the function
    let __functionHandler;
    
    // Try module.exports patterns
    if (typeof module !== 'undefined' && module.exports) {
      __functionHandler = module.exports.default || module.exports;
    }
    
    // Try direct function reference from last line
    const codeLines = ${JSON.stringify(functionCode.trim().split('\n'))};
    const lastLine = codeLines[codeLines.length - 1].trim();
    if (lastLine && !lastLine.includes('(') && !lastLine.includes('{') && typeof eval('typeof ' + lastLine) === 'string' && eval('typeof ' + lastLine) === 'function') {
      try {
        __functionHandler = eval(lastLine);
      } catch (e) {
        // Ignore and continue
      }
    }
    
    // Try to find function declarations
    const functionNames = [${this.extractFunctionNames(functionCode).map(name => `"${name}"`).join(', ')}];
    if (!__functionHandler && functionNames.length > 0) {
      for (const funcName of functionNames) {
        try {
          const potentialHandler = eval(funcName);
          if (typeof potentialHandler === 'function') {
            __functionHandler = potentialHandler;
            break;
          }
        } catch (e) {
          // Try next
        }
      }
    }
    
    if (typeof __functionHandler === 'function') {
      // Call handler with request
      const result = await __functionHandler(request);
      return result;
    } else {
      // List available functions for debugging
      const availableFunctions = [];
      for (const key of Object.keys(this).concat(Object.getOwnPropertyNames(this))) {
        if (typeof this[key] === 'function') {
          availableFunctions.push(key);
        }
      }
      throw new Error('No handler function found. Available functions: ' + availableFunctions.join(', ') + '. Last line: ' + lastLine);
    }
  } catch (error) {
    throw new Error('Function execution failed: ' + error.message);
  }
})();
`;
  }

  /**
   * Extract function names from code (simple regex approach)
   */
  private extractFunctionNames(code: string): string[] {
    const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=|let\s+(\w+)\s*=|var\s+(\w+)\s*=)/g;
    const matches = [];
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      const functionName = match[1] || match[2] || match[3] || match[4];
      if (functionName && functionName !== 'require' && functionName !== 'module') {
        matches.push(functionName);
      }
    }
    
    return matches;
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

    if (code.length > 100000) {
      throw new Error('Function code too large (max 100KB)');
    }

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      'require("fs")',
      'require("child_process")',
      'eval(',
      'Function(',
      'process.exit',
    ];

    for (const pattern of dangerousPatterns) {
      if (code.includes(pattern)) {
        console.warn(`Warning: Function code contains potentially unsafe pattern: ${pattern}`);
      }
    }
  }
}

// Type definitions
export interface NodeJSDeployedFunction {
  name: string;
  originalCode: string;
  wrappedCode: string;
  importMap: Record<string, any>;
  deployedAt: Date;
  directory: string;
  status: 'deployed' | 'error';
  compiledScript: Script;
}

export interface NodeJSDeploymentResult {
  success: boolean;
  functionName: string;
  message?: string;
  error?: string;
  deployedAt?: Date;
  functionUrl?: string;
  executionRuntime?: string;
  codeLength?: number;
}

export interface NodeJSExecutionResult {
  success: boolean;
  functionName: string;
  data?: any;
  error?: string;
  statusCode?: number;
  executionTime?: number;
  runtime?: string;
  timestamp?: Date;
  availableFunctions?: string[];
  headers?: Record<string, string>;
}

export interface NodeJSFunctionSummary {
  name: string;
  deployedAt: Date;
  status: string;
  hasImportMap: boolean;
  codeLength: number;
  runtime: string;
}
