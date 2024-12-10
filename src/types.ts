import {
    XmlCdata,
    XmlComment,
    XmlDeclaration,
    XmlDocument,
    XmlDocumentType,
    XmlElement,
    XmlProcessingInstruction, XmlText
} from "@rgrove/parse-xml";

export type NodeData = XmlDocument |  XmlElement | XmlComment | XmlDeclaration | XmlDocumentType | XmlProcessingInstruction | XmlCdata | XmlText;
