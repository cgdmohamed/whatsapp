import type {
  CreateMessageTemplateComponentInput,
  TemplateButton,
  TemplateButtonType,
  TemplateComponent,
  TemplateComponentType,
  TemplatePreviewDto,
  TemplateVariable,
} from '@wa/shared';
import { TEMPLATE_BUTTON_TYPES, TEMPLATE_COMPONENT_TYPES } from '@wa/shared';

import type { CreateTemplateButtonInput, CreateTemplateComponentInput, MetaTemplateComponent } from '../meta-api/meta-api.types';

const HAS_VARIABLE_PATTERN = /\{\{\d+\}\}/;
const NON_NUMERIC_VARIABLE_PATTERN = /\{\{(?!\d+\}\})/;
const MAX_TEMPLATE_VARIABLES = 10;

const TYPE_PRIORITY: Record<TemplateComponentType, number> = {
  HEADER: 0,
  BODY: 1,
  FOOTER: 2,
  BUTTONS: 3,
};

export function extractVariableNames(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }
  return Array.from(text.matchAll(/\{\{(\d+)\}\}/g), (match) => `{{${match[1]}}}`);
}

function isKnownButtonType(value: unknown): value is TemplateButtonType {
  return typeof value === 'string' && (TEMPLATE_BUTTON_TYPES as readonly string[]).includes(value);
}

function isKnownComponentType(value: unknown): value is TemplateComponentType {
  return typeof value === 'string' && (TEMPLATE_COMPONENT_TYPES as readonly string[]).includes(value);
}

function bodyExampleValues(example: MetaTemplateComponent['example'], variableCount: number): string[] | null {
  const raw = example?.body_text;
  if (!raw || raw.length === 0) {
    return null;
  }
  const first: string | string[] | undefined = raw[0];
  if (first === undefined || Array.isArray(first)) {
    if (first === undefined) {
      return null;
    }
    const values = first.slice(0, variableCount);
    return values.every((value) => typeof value === 'string') ? values : null;
  }
  return null;
}

export function parseMetaComponents(metaComponents: MetaTemplateComponent[] | undefined): TemplateComponent[] {
  if (!metaComponents) {
    return [];
  }
  return metaComponents.map((component, index): TemplateComponent => {
    const type: TemplateComponentType = isKnownComponentType(component.type) ? component.type : 'BODY';
    const variables: TemplateVariable[] = [];
    let example: string[] | null = null;

    if (type === 'HEADER') {
      if (component.format === 'TEXT') {
        variables.push(...extractVariableNames(component.text).map((name) => ({ name, format: 'TEXT' as const, required: true, example: null })));
        const headerExample = component.example?.header_text?.[0];
        if (headerExample && variables.length > 0) {
          example = [headerExample];
        }
      }
    } else if (type === 'BODY') {
      variables.push(...extractVariableNames(component.text).map((name) => ({ name, format: 'TEXT' as const, required: true, example: null })));
      example = variables.length > 0 ? bodyExampleValues(component.example, variables.length) : null;
    }

    const buttons: TemplateButton[] | null = (component.buttons ?? [])
      .filter((button) => button.type !== undefined && button.type !== null)
      .map((button) => ({
        type: isKnownButtonType(button.type) ? button.type : 'QUICK_REPLY',
        text: button.text ?? '',
        url: button.url ?? null,
        phoneNumber: button.phone_number ?? null,
      }));

    return {
      type,
      position: index,
      text: component.text ?? null,
      example,
      buttons: buttons.length > 0 ? buttons : null,
      variables,
    };
  });
}

export interface VariableSequenceResult {
  variables: TemplateVariable[];
  issues: string[];
}

export function collectVariablesInOrder(components: TemplateComponent[]): TemplateVariable[] {
  const ordered = [...components].sort(
    (a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type] || a.position - b.position,
  );
  const variables: TemplateVariable[] = [];
  for (const component of ordered) {
    variables.push(...component.variables);
    if (component.buttons) {
      for (const button of component.buttons) {
        for (const name of extractVariableNames(button.url)) {
          variables.push({ name, format: 'TEXT', required: true, example: null });
        }
      }
    }
  }
  return variables;
}

export function validateTemplateVariables(components: TemplateComponent[]): VariableSequenceResult {
  const issues: string[] = [];
  const variables = collectVariablesInOrder(components);

  for (const component of components) {
    if (component.type === 'FOOTER' && component.text && HAS_VARIABLE_PATTERN.test(component.text)) {
      issues.push('TEMPLATE_FOOTER_VARIABLES_NOT_ALLOWED');
    }
    if (component.text && NON_NUMERIC_VARIABLE_PATTERN.test(component.text)) {
      issues.push('TEMPLATE_VARIABLE_NON_NUMERIC');
    }
    if (component.buttons) {
      for (const button of component.buttons) {
        if (button.url && NON_NUMERIC_VARIABLE_PATTERN.test(button.url)) {
          issues.push('TEMPLATE_VARIABLE_NON_NUMERIC');
        }
      }
    }
  }

  if (variables.length > MAX_TEMPLATE_VARIABLES) {
    issues.push('TEMPLATE_TOO_MANY_VARIABLES');
  }

  const seenNumbers = new Map<number, string>();
  for (let index = 0; index < variables.length; index++) {
    const variable = variables[index]!;
    const number = extractVariableNumber(variable.name);
    if (number === null || number < 1) {
      issues.push(`TEMPLATE_INVALID_VARIABLE_${variable.name}`);
      continue;
    }
    const expected = index + 1;
    if (number !== expected) {
      issues.push(`TEMPLATE_VARIABLE_SEQUENCE_EXPECTED_${expected}_GOT_${number}`);
    }
    const existing = seenNumbers.get(number);
    if (existing) {
      issues.push(`TEMPLATE_DUPLICATE_VARIABLE_${number}`);
    }
    seenNumbers.set(number, variable.name);
  }

  return { variables, issues };
}

function extractVariableNumber(name: string): number | null {
  const match = name.match(/^{{(\d+)}}$/);
  return match ? Number(match[1]) : null;
}

export interface BuiltCreateComponents {
  metaComponents: CreateTemplateComponentInput[];
  parsed: TemplateComponent[];
  issues: string[];
}

export function buildCreateComponents(
  input: CreateMessageTemplateComponentInput[],
  samples: string[] = [],
): BuiltCreateComponents {
  const issues: string[] = [];
  const metaComponents: CreateTemplateComponentInput[] = [];
  let hasBody = false;

  const sampleFor = (position: number): string => {
    const provided = samples[position - 1];
    return provided !== undefined && provided.trim().length > 0 ? provided.trim() : `Example ${position}`;
  };

  for (const component of input) {
    const meta: CreateTemplateComponentInput = { type: component.type };
    if (component.type === 'HEADER') {
      const format = component.headerFormat ?? 'TEXT';
      if (format === 'TEXT') {
        meta.format = 'TEXT';
        meta.text = component.text ?? '';
        const headerNumbers = extractVariableNames(meta.text).map((name) => Number(name.replace(/[^\d]/g, '')));
        if (headerNumbers.length > 0) {
          meta.example = { header_text: [sampleFor(headerNumbers[0]!) ] };
        }
      } else {
        meta.format = format;
      }
    } else if (component.type === 'BUTTONS') {
      meta.buttons = (component.buttons ?? []).map((button) => {
        const built: CreateTemplateButtonInput = {
          type: button.type,
          text: button.text,
          ...(button.type === 'URL' && button.url ? { url: button.url } : {}),
          ...(button.type === 'PHONE_NUMBER' && button.phoneNumber ? { phone_number: button.phoneNumber } : {}),
        };
        if (button.type === 'URL' && button.url && HAS_VARIABLE_PATTERN.test(button.url)) {
          const urlNumbers = extractVariableNames(button.url).map((name) => Number(name.replace(/[^\d]/g, '')));
          if (urlNumbers.length > 0) {
            const resolved = button.url.replace(/\{\{(\d+)\}\}/g, (_match, number: string) => sampleFor(Number(number)));
            built.example = [resolved];
          }
        }
        return built;
      });
    } else {
      if (component.type === 'BODY') {
        hasBody = true;
      }
      meta.text = component.text ?? '';
      const bodyNumbers = extractVariableNames(meta.text).map((name) => Number(name.replace(/[^\d]/g, '')));
      if (component.type === 'BODY' && bodyNumbers.length > 0) {
        meta.example = { body_text: [bodyNumbers.map((number) => sampleFor(number))] };
      }
    }
    metaComponents.push(meta);
  }

  if (!hasBody) {
    issues.push('TEMPLATE_BODY_REQUIRED');
  }

  const parsed = parseMetaComponents(metaComponents);
  const sequence = validateTemplateVariables(parsed);
  issues.push(...sequence.issues);

  return { metaComponents, parsed, issues };
}

export function renderTemplatePreview(components: TemplateComponent[], samples: string[]): TemplatePreviewDto {
  const variables = collectVariablesInOrder(components);
  const sampleValues: Record<string, string> = {};
  const unresolved: string[] = [];

  for (const variable of variables) {
    const number = extractVariableNumber(variable.name);
    const sample = number !== null && number <= samples.length ? samples[number - 1] : undefined;
    if (sample !== undefined && sample.length > 0) {
      sampleValues[variable.name] = sample;
    } else {
      unresolved.push(variable.name);
    }
  }

  const render = (text: string | null): string | null => {
    if (!text) {
      return text;
    }
    return text.replace(/\{\{(\d+)\}\}/g, (_match, number: string) => sampleValues[`{{${number}}}`] ?? `{{${number}}}`);
  };

  const header = components.find((component) => component.type === 'HEADER');
  const body = components.find((component) => component.type === 'BODY');
  const footer = components.find((component) => component.type === 'FOOTER');
  const buttonsComponent = components.find((component) => component.type === 'BUTTONS');

  return {
    headerText: header?.text ? render(header.text) : null,
    bodyText: body?.text ? render(body.text) : null,
    footerText: footer?.text ? render(footer.text) : null,
    buttons: (buttonsComponent?.buttons ?? []).map((button) => ({
      ...button,
      url: button.url ? render(button.url) : button.url,
    })),
    variables,
    sampleValues,
    unresolved,
  };
}
