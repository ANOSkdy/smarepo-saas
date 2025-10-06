/**
 * Minimal accessibility-focused ESLint rules used in this repository.
 * This is not a drop-in replacement for eslint-plugin-jsx-a11y but covers
 * the subset of rules we enable offline.
 */

/** @typedef {import('eslint').Rule.RuleModule} RuleModule */

/**
 * @template {import('estree').Node} T
 * @param {import('eslint').Rule.RuleContext} context
 * @param {T} node
 * @param {string} messageId
 */
function report(context, node, messageId) {
  context.report({ node, messageId });
}

/**
 * @param {any} node
 * @param {string} name
 */
function hasJsxAttribute(node, name) {
  return node.attributes.some(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      attribute.name?.type === 'JSXIdentifier' &&
      attribute.name.name === name,
  );
}

/**
 * @param {any} attribute
 */
function getLiteralValue(attribute) {
  if (attribute.type !== 'JSXAttribute') {
    return undefined;
  }
  const value = attribute.value;
  if (!value) {
    return true;
  }
  if (value.type === 'Literal') {
    return value.value;
  }
  if (value.type === 'JSXExpressionContainer' && value.expression.type === 'Literal') {
    return value.expression.value;
  }
  return undefined;
}

/** @type {RuleModule} */
const anchorIsValidRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'ensures anchor elements include a valid href attribute',
      recommended: false,
    },
    schema: [],
    messages: {
      missingHref: '<a> 要素には有効な href 属性を指定してください。',
      invalidHref: 'href 属性に javascript: スキームは使用できません。',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'a') {
          return;
        }
        const hrefAttr = node.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name?.type === 'JSXIdentifier' &&
            attribute.name.name === 'href',
        );
        if (!hrefAttr) {
          report(context, node, 'missingHref');
          return;
        }
        const hrefValue = getLiteralValue(hrefAttr);
        if (typeof hrefValue === 'string' && hrefValue.trim().toLowerCase().startsWith('javascript:')) {
          report(context, node, 'invalidHref');
        }
      },
    };
  },
};

/** @type {RuleModule} */
const clickEventsHaveKeyEventsRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'enforce keyboard event handlers when using onClick',
      recommended: false,
    },
    schema: [],
    messages: {
      missingKeyHandler: 'onClick を使用する場合はキーボードイベントハンドラーも追加してください。',
    },
  },
  create(context) {
    const interactiveElements = new Set(['a', 'button', 'input', 'select', 'textarea', 'option']);
    const allowedRoles = new Set(['button', 'link']);
    return {
      JSXOpeningElement(node) {
        if (!hasJsxAttribute(node, 'onClick')) {
          return;
        }
        if (node.name.type !== 'JSXIdentifier') {
          return;
        }
        const elementName = node.name.name;
        if (elementName[0] === elementName[0]?.toUpperCase()) {
          return;
        }
        if (interactiveElements.has(elementName)) {
          return;
        }
        const roleAttr = node.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name?.type === 'JSXIdentifier' &&
            attribute.name.name === 'role',
        );
        const roleValue = roleAttr ? getLiteralValue(roleAttr) : undefined;
        if (typeof roleValue === 'string' && allowedRoles.has(roleValue)) {
          return;
        }
        const hasKeyboardHandler =
          hasJsxAttribute(node, 'onKeyDown') ||
          hasJsxAttribute(node, 'onKeyUp') ||
          hasJsxAttribute(node, 'onKeyPress');
        if (!hasKeyboardHandler) {
          report(context, node, 'missingKeyHandler');
        }
      },
    };
  },
};

function hasControlChild(children) {
  return children.some((child) => {
    if (child.type === 'JSXElement') {
      if (child.openingElement.name.type === 'JSXIdentifier') {
        const name = child.openingElement.name.name;
        if (['input', 'select', 'textarea'].includes(name)) {
          return true;
        }
      }
      return hasControlChild(child.children);
    }
    return false;
  });
}

/** @type {RuleModule} */
const labelHasAssociatedControlRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'ensures label elements reference a form control',
      recommended: false,
    },
    schema: [],
    messages: {
      missingAssociation: '<label> 要素には htmlFor 属性か子要素としてフォーム部品を含めてください。',
    },
  },
  create(context) {
    return {
      JSXElement(node) {
        if (node.openingElement.name.type !== 'JSXIdentifier' || node.openingElement.name.name !== 'label') {
          return;
        }
        const hasHtmlFor = node.openingElement.attributes.some(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name?.type === 'JSXIdentifier' &&
            attribute.name.name === 'htmlFor',
        );
        if (hasHtmlFor) {
          return;
        }
        if (!hasControlChild(node.children)) {
          report(context, node.openingElement, 'missingAssociation');
        }
      },
    };
  },
};

const plugin = {
  rules: {
    'anchor-is-valid': anchorIsValidRule,
    'click-events-have-key-events': clickEventsHaveKeyEventsRule,
    'label-has-associated-control': labelHasAssociatedControlRule,
  },
};

export default plugin;
