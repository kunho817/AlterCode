/**
 * API Checker Service
 *
 * Validates function calls against known signatures:
 * - Argument count and type checking
 * - Parameter name matching
 * - Return type verification
 */

import {
  IAPICheckerService,
  ISemanticIndexService,
  APIValidationRequest,
  APIValidationResult,
  FunctionCall,
  ArgumentError,
  FunctionSymbol,
  ClassSymbol,
  AsyncResult,
  Ok,
  Err,
  ILogger,
  AppError,
} from '../types';

/**
 * API Checker Service implementation
 */
export class APICheckerService implements IAPICheckerService {
  private readonly semanticIndex: ISemanticIndexService;
  private readonly logger?: ILogger;

  constructor(semanticIndex: ISemanticIndexService, logger?: ILogger) {
    this.semanticIndex = semanticIndex;
    this.logger = logger?.child('APICheckerService');
  }

  async validate(request: APIValidationRequest): AsyncResult<APIValidationResult[]> {
    try {
      this.logger?.info('Validating API calls', { count: request.calls.length });

      const results: APIValidationResult[] = [];

      for (const call of request.calls) {
        const result = this.validateCall(call);
        results.push(result);
      }

      const validCount = results.filter((r) => r.valid).length;
      this.logger?.info('API validation complete', {
        total: results.length,
        valid: validCount,
        invalid: results.length - validCount,
      });

      return Ok(results);
    } catch (error) {
      this.logger?.error('API validation failed', error as Error);
      return Err(
        new AppError('VERIFICATION', `API validation failed: ${(error as Error).message}`)
      );
    }
  }

  getSignature(name: string, module?: string): string | null {
    // Try to find the function
    let symbols = this.semanticIndex.findSymbol(name, 'function');

    // Filter by module if specified
    if (module && symbols.length > 0) {
      symbols = symbols.filter((s) => {
        const filePath = s.location.file as string;
        return filePath.includes(module);
      });
    }

    if (symbols.length === 0) {
      // Maybe it's a class method - search for class
      const className = name.split('.')[0];
      if (!className) return null;
      const classes = this.semanticIndex.findSymbol(className, 'class');
      if (classes.length > 0 && name.includes('.')) {
        const methodName = name.split('.')[1];
        const cls = classes[0] as ClassSymbol;
        const method = cls.members.find((m) => m.name === methodName && m.kind === 'method');
        if (method) {
          const params = method.parameters?.map((p) => `${p.name}: ${p.type}`).join(', ') ?? '';
          return `${name}(${params}): ${method.returnType ?? 'void'}`;
        }
      }
      return null;
    }

    const func = symbols[0] as FunctionSymbol;
    const params = func.parameters.map((p) => {
      const optional = p.optional ? '?' : '';
      const defaultVal = p.defaultValue ? ` = ${p.defaultValue}` : '';
      return `${p.name}${optional}: ${p.type}${defaultVal}`;
    }).join(', ');

    return `${func.async ? 'async ' : ''}function ${name}(${params}): ${func.returnType}`;
  }

  /**
   * Validate a single function call
   */
  private validateCall(call: FunctionCall): APIValidationResult {
    const { name, module, arguments: args, location } = call;

    // Find the function
    let symbols = this.semanticIndex.findSymbol(name, 'function');

    if (module) {
      symbols = symbols.filter((s) => (s.location.file as string).includes(module));
    }

    if (symbols.length === 0) {
      // Check for class method
      const methodResult = this.validateMethodCall(call);
      if (methodResult) return methodResult;

      return {
        call,
        valid: false,
        functionExists: false,
        signatureMatch: false,
        argumentErrors: [],
      };
    }

    const func = symbols[0] as FunctionSymbol;
    const signature = this.getSignature(name, module);
    const argumentErrors = this.validateArguments(args, func);

    return {
      call,
      valid: argumentErrors.length === 0,
      functionExists: true,
      signatureMatch: argumentErrors.length === 0,
      argumentErrors,
      expectedSignature: signature ?? undefined,
    };
  }

  /**
   * Validate a method call
   */
  private validateMethodCall(call: FunctionCall): APIValidationResult | null {
    const { name } = call;

    // Check if it's a method call like "ClassName.methodName"
    if (!name.includes('.')) return null;

    const parts = name.split('.');
    const className = parts[0];
    const methodName = parts[1];
    if (!className || !methodName) return null;
    const classes = this.semanticIndex.findSymbol(className, 'class');

    if (classes.length === 0) return null;

    const cls = classes[0] as ClassSymbol;
    const method = cls.members.find((m) => m.name === methodName);

    if (!method) {
      return {
        call,
        valid: false,
        functionExists: false,
        signatureMatch: false,
        argumentErrors: [{
          position: 0,
          expected: 'method',
          actual: 'undefined',
          message: `Method '${methodName}' does not exist on class '${className}'`,
        }],
      };
    }

    // Validate method arguments
    const argumentErrors = this.validateMethodArguments(call.arguments, method);

    const params = method.parameters?.map((p) => `${p.name}: ${p.type}`).join(', ') ?? '';
    const signature = `${className}.${methodName}(${params}): ${method.returnType ?? 'void'}`;

    return {
      call,
      valid: argumentErrors.length === 0,
      functionExists: true,
      signatureMatch: argumentErrors.length === 0,
      argumentErrors,
      expectedSignature: signature,
    };
  }

  /**
   * Validate function arguments
   */
  private validateArguments(args: FunctionCall['arguments'], func: FunctionSymbol): ArgumentError[] {
    const errors: ArgumentError[] = [];
    const { parameters } = func;

    // Check required parameter count
    const requiredParams = parameters.filter((p) => !p.optional && !p.defaultValue);
    if (args.length < requiredParams.length) {
      errors.push({
        position: args.length,
        expected: `${requiredParams.length} required arguments`,
        actual: `${args.length} arguments`,
        message: `Missing required argument: ${requiredParams[args.length]?.name}`,
      });
    }

    // Check maximum parameter count (excluding rest parameters)
    const hasRest = parameters.some((p) => p.rest);
    if (!hasRest && args.length > parameters.length) {
      errors.push({
        position: parameters.length,
        expected: `at most ${parameters.length} arguments`,
        actual: `${args.length} arguments`,
        message: `Too many arguments provided`,
      });
    }

    // Validate each argument
    for (let i = 0; i < Math.min(args.length, parameters.length); i++) {
      const arg = args[i];
      const param = parameters[i];
      if (!arg || !param) continue;

      // Type checking (simplified)
      const typeError = this.checkTypeCompatibility(arg.inferredType, param.type);
      if (typeError) {
        errors.push({
          position: i,
          name: param.name,
          expected: param.type,
          actual: arg.inferredType,
          message: typeError,
        });
      }
    }

    return errors;
  }

  /**
   * Validate method arguments
   */
  private validateMethodArguments(
    args: FunctionCall['arguments'],
    method: ClassSymbol['members'][0]
  ): ArgumentError[] {
    const errors: ArgumentError[] = [];
    const parameters = method.parameters ?? [];

    // Check required parameter count
    const requiredParams = parameters.filter((p) => !p.optional && !p.defaultValue);
    if (args.length < requiredParams.length) {
      errors.push({
        position: args.length,
        expected: `${requiredParams.length} required arguments`,
        actual: `${args.length} arguments`,
        message: `Missing required argument: ${requiredParams[args.length]?.name}`,
      });
    }

    // Validate each argument
    for (let i = 0; i < Math.min(args.length, parameters.length); i++) {
      const arg = args[i];
      const param = parameters[i];
      if (!arg || !param) continue;

      const typeError = this.checkTypeCompatibility(arg.inferredType, param.type);
      if (typeError) {
        errors.push({
          position: i,
          name: param.name,
          expected: param.type,
          actual: arg.inferredType,
          message: typeError,
        });
      }
    }

    return errors;
  }

  /**
   * Check type compatibility (simplified)
   */
  private checkTypeCompatibility(actual: string, expected: string): string | null {
    // Normalize types
    const actualNorm = this.normalizeType(actual);
    const expectedNorm = this.normalizeType(expected);

    // Exact match
    if (actualNorm === expectedNorm) return null;

    // Any type accepts anything
    if (expectedNorm === 'any' || expectedNorm === 'unknown') return null;

    // Check for union types
    if (expectedNorm.includes('|')) {
      const options = expectedNorm.split('|').map((t) => t.trim());
      if (options.some((o) => this.normalizeType(o) === actualNorm)) return null;
    }

    // Check for basic type compatibility
    if (this.isSubtype(actualNorm, expectedNorm)) return null;

    return `Type '${actual}' is not assignable to type '${expected}'`;
  }

  /**
   * Normalize a type string
   */
  private normalizeType(type: string): string {
    return type
      .replace(/\s+/g, ' ')
      .replace(/readonly\s+/g, '')
      .trim()
      .toLowerCase();
  }

  /**
   * Check if one type is a subtype of another (simplified)
   */
  private isSubtype(actual: string, expected: string): boolean {
    // Primitive types
    if (expected === 'object' && !['string', 'number', 'boolean', 'undefined', 'null'].includes(actual)) {
      return true;
    }

    // Array types
    if (expected.endsWith('[]') && actual.endsWith('[]')) {
      return this.isSubtype(
        actual.slice(0, -2),
        expected.slice(0, -2)
      );
    }

    // Number literal to number
    if (expected === 'number' && /^\d+$/.test(actual)) {
      return true;
    }

    // String literal to string
    if (expected === 'string' && /^['"]/.test(actual)) {
      return true;
    }

    return false;
  }
}

/**
 * Create an API checker service
 */
export function createAPICheckerService(
  semanticIndex: ISemanticIndexService,
  logger?: ILogger
): IAPICheckerService {
  return new APICheckerService(semanticIndex, logger);
}
