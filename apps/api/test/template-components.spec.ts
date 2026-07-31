import {
  buildCreateComponents,
  collectVariablesInOrder,
  parseMetaComponents,
  renderTemplatePreview,
  validateTemplateVariables,
} from '../src/modules/whatsapp/templates/template-components';
import type { TemplateComponent } from '@wa/shared';

describe('template-components', () => {
  describe('parseMetaComponents', () => {
    it('extracts body variables and example values', () => {
      const components = parseMetaComponents([
        {
          type: 'BODY',
          text: 'Hi {{1}}, your order {{2}} is confirmed.',
          example: { body_text: [['John', '1234']] },
        },
      ]);
      expect(components).toHaveLength(1);
      expect(components[0]?.type).toBe('BODY');
      expect(components[0]?.variables.map((v) => v.name)).toEqual(['{{1}}', '{{2}}']);
      expect(components[0]?.example).toEqual(['John', '1234']);
    });

    it('parses header with text variables', () => {
      const components = parseMetaComponents([
        { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}', example: { header_text: ['Order #1'] } },
        { type: 'BODY', text: 'Hello {{2}}' },
      ]);
      expect(components[0]?.variables).toEqual([{ name: '{{1}}', format: 'TEXT', required: true, example: null }]);
      expect(components[0]?.example).toEqual(['Order #1']);
      expect(components[1]?.variables.map((v) => v.name)).toEqual(['{{2}}']);
    });

    it('parses buttons including url placeholders', () => {
      const components = parseMetaComponents([
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Track' },
            { type: 'URL', text: 'Visit', url: 'https://example.com/{{1}}' },
          ],
        },
      ]);
      expect(components[0]?.buttons).toEqual([
        { type: 'QUICK_REPLY', text: 'Track', url: null, phoneNumber: null },
        { type: 'URL', text: 'Visit', url: 'https://example.com/{{1}}', phoneNumber: null },
      ]);
    });
  });

  describe('validateTemplateVariables', () => {
    it('flags a gap in the variable sequence', () => {
      const components: TemplateComponent[] = [
        {
          type: 'BODY',
          position: 0,
          text: 'Hello {{1}}, ref {{3}}',
          example: null,
          buttons: null,
          variables: [
            { name: '{{1}}', format: 'TEXT', required: true, example: null },
            { name: '{{3}}', format: 'TEXT', required: true, example: null },
          ],
        },
      ];
      const { issues } = validateTemplateVariables(components);
      expect(issues.some((issue) => issue.startsWith('TEMPLATE_VARIABLE_SEQUENCE_EXPECTED'))).toBe(true);
    });

    it('flags duplicate variable numbers', () => {
      const components: TemplateComponent[] = [
        {
          type: 'BODY',
          position: 0,
          text: 'Hi {{1}} and {{1}}',
          example: null,
          buttons: null,
          variables: [
            { name: '{{1}}', format: 'TEXT', required: true, example: null },
            { name: '{{1}}', format: 'TEXT', required: true, example: null },
          ],
        },
      ];
      const { issues } = validateTemplateVariables(components);
      expect(issues.some((issue) => issue.startsWith('TEMPLATE_DUPLICATE_VARIABLE'))).toBe(true);
    });

    it('flags variables in footer', () => {
      const components: TemplateComponent[] = [
        {
          type: 'FOOTER',
          position: 0,
          text: 'Reply {{1}}',
          example: null,
          buttons: null,
          variables: [{ name: '{{1}}', format: 'TEXT', required: true, example: null }],
        },
      ];
      const { issues } = validateTemplateVariables(components);
      expect(issues).toContain('TEMPLATE_FOOTER_VARIABLES_NOT_ALLOWED');
    });

    it('flags too many variables', () => {
      const variables = Array.from({ length: 11 }, (_, i) => ({
        name: `{{${i + 1}}}`,
        format: 'TEXT' as const,
        required: true,
        example: null,
      }));
      const components: TemplateComponent[] = [
        { type: 'BODY', position: 0, text: '', example: null, buttons: null, variables },
      ];
      const { issues } = validateTemplateVariables(components);
      expect(issues).toContain('TEMPLATE_TOO_MANY_VARIABLES');
    });

    it('passes for a valid sequential sequence across header, body, and button url', () => {
      const components: TemplateComponent[] = [
        {
          type: 'HEADER',
          position: 0,
          text: 'Hi {{1}}',
          example: null,
          buttons: null,
          variables: [{ name: '{{1}}', format: 'TEXT', required: true, example: null }],
        },
        {
          type: 'BODY',
          position: 1,
          text: 'Order {{2}}',
          example: null,
          buttons: null,
          variables: [{ name: '{{2}}', format: 'TEXT', required: true, example: null }],
        },
        {
          type: 'BUTTONS',
          position: 2,
          text: null,
          example: null,
          buttons: [{ type: 'URL', text: 'Open', url: 'https://x.com/{{3}}', phoneNumber: null }],
          variables: [],
        },
      ];
      const { issues } = validateTemplateVariables(components);
      expect(issues).toEqual([]);
    });

    it('collects variables in header, body, footer, buttons order', () => {
      const components: TemplateComponent[] = [
        {
          type: 'BUTTONS',
          position: 2,
          text: null,
          example: null,
          buttons: [{ type: 'URL', text: 'Open', url: 'https://x.com/{{3}}', phoneNumber: null }],
          variables: [],
        },
        {
          type: 'HEADER',
          position: 0,
          text: 'Hi {{1}}',
          example: null,
          buttons: null,
          variables: [{ name: '{{1}}', format: 'TEXT', required: true, example: null }],
        },
        {
          type: 'BODY',
          position: 1,
          text: 'Order {{2}}',
          example: null,
          buttons: null,
          variables: [{ name: '{{2}}', format: 'TEXT', required: true, example: null }],
        },
      ];
      const order = collectVariablesInOrder(components).map((v) => v.name);
      expect(order).toEqual(['{{1}}', '{{2}}', '{{3}}']);
    });
  });

  describe('buildCreateComponents', () => {
    it('requires a body component', () => {
      const { issues } = buildCreateComponents([{ type: 'HEADER', headerFormat: 'TEXT', text: 'Hi' }]);
      expect(issues).toContain('TEMPLATE_BODY_REQUIRED');
    });

    it('builds a valid meta payload and parses it back', () => {
      const { metaComponents, parsed, issues } = buildCreateComponents([
        { type: 'HEADER', headerFormat: 'TEXT', text: 'Order {{1}}' },
        { type: 'BODY', text: 'Hi {{2}}, your order {{1}}? No, {{2}}?' },
      ]);
      expect(issues.some((issue) => issue.startsWith('TEMPLATE_VARIABLE_SEQUENCE_EXPECTED'))).toBe(true);
      expect(metaComponents[0]).toMatchObject({ type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' });
      expect(parsed).toHaveLength(2);
    });
  });

  describe('renderTemplatePreview', () => {
    it('substitutes samples and reports unresolved variables', () => {
      const components: TemplateComponent[] = [
        {
          type: 'BODY',
          position: 0,
          text: 'Hello {{1}}, your code is {{2}}',
          example: null,
          buttons: null,
          variables: [
            { name: '{{1}}', format: 'TEXT', required: true, example: null },
            { name: '{{2}}', format: 'TEXT', required: true, example: null },
          ],
        },
      ];
      const preview = renderTemplatePreview(components, ['Alice', '4242']);
      expect(preview.bodyText).toBe('Hello Alice, your code is 4242');
      expect(preview.unresolved).toEqual([]);
      expect(preview.sampleValues).toEqual({ '{{1}}': 'Alice', '{{2}}': '4242' });
    });

    it('leaves placeholders when samples are missing', () => {
      const components: TemplateComponent[] = [
        {
          type: 'BODY',
          position: 0,
          text: 'Hi {{1}}',
          example: null,
          buttons: null,
          variables: [{ name: '{{1}}', format: 'TEXT', required: true, example: null }],
        },
      ];
      const preview = renderTemplatePreview(components, []);
      expect(preview.bodyText).toBe('Hi {{1}}');
      expect(preview.unresolved).toEqual(['{{1}}']);
    });
  });
});