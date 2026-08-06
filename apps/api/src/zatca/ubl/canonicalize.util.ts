import { DOMParser } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto';

/**
 * Canonical XML for hashing and signing.
 *
 * ⚠️ **On the algorithm version.** ZATCA mandates Canonical XML **1.1**
 * (`http://www.w3.org/2006/12/xml-c14n11`), and `xml-crypto` only implements
 * 1.0 (`REC-xml-c14n-20010315`). That is safe *here*, not in general: the two
 * differ solely in how they propagate the `xml:` attributes (`xml:base`,
 * `xml:lang`, `xml:space`, `xml:id`) onto an apex node. A document that carries
 * none of them canonicalizes byte-identically under both.
 *
 * Rather than trust that a UBL invoice will never grow such an attribute,
 * `canonicalize` refuses to produce output when one appears — so the day the
 * assumption stops holding, this fails loudly instead of silently emitting a
 * hash the authority will compute differently.
 */

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

/** Walks the tree looking for any attribute in the `xml:` namespace. */
function findXmlNamespacedAttribute(node: Node): string | null {
  if (node.nodeType === 1) {
    const attributes = (node as Element).attributes;
    for (let i = 0; i < attributes.length; i++) {
      const attr = attributes.item(i)!;
      if (attr.namespaceURI === XML_NAMESPACE || attr.name.startsWith('xml:')) {
        return attr.name;
      }
    }
  }

  for (let i = 0; i < node.childNodes.length; i++) {
    const found = findXmlNamespacedAttribute(node.childNodes.item(i)!);
    if (found) return found;
  }
  return null;
}

export function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
}

/**
 * Canonicalizes a node (defaults to the whole document) and returns the exact
 * bytes the authority will hash.
 */
export function canonicalize(node: Node): string {
  const offending = findXmlNamespacedAttribute(node);
  if (offending) {
    throw new Error(
      `Canonical XML 1.1 is required and this document carries "${offending}" — ` +
        'the 1.0 implementation in use is only equivalent for documents without xml:* attributes.',
    );
  }

  // xml-crypto canonicalizes elements, not documents. Substituting the root
  // element is equivalent here: the two differ only in comments and processing
  // instructions outside the root, and this generator emits neither.
  const target = node.nodeType === 9 ? (node as Document).documentElement : node;

  return new C14nCanonicalization().process(target as never, {
    // No prefix rewriting: the invoice already declares every prefix it uses on
    // the root, and inclusive c14n keeps them where they are.
    ancestorNamespaces: [],
  }) as unknown as string;
}

/** Canonicalizes and returns the UTF-8 bytes — hashing must never go through a
 * JS string, whose default encoding is not UTF-8. */
export function canonicalBytes(node: Node): Buffer {
  return Buffer.from(canonicalize(node), 'utf8');
}
