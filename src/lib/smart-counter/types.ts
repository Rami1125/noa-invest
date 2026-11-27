/**
 * SMART COUNTER & TECHNICAL KNOWLEDGE ENGINE — Types
 * Noa AI | ח. סבן חומרי בניין (1994) בע״מ
 */

export type SmartIntent =
  | "TECHNICAL_GUIDANCE"
  | "PRODUCT_COMPARISON"
  | "CUSTOMER_DIAGNOSIS"
  | "CROSS_SELLING"
  | "SALES_TRAINING"
  | "TRAINING_MEDIA"
  | "KNOWLEDGE_SEARCH"
  | "LOGISTICS"
  | "UNKNOWN";

export type IntentResult = {
  primary: SmartIntent;
  secondary: SmartIntent[];
  confidence: number;
  entities: {
    products?: string[];
    manufacturers?: string[];
    categories?: string[];
    workType?: string;
    surface?: string;
    problem?: string;
  };
  requiredContext: string[];
  suggestedActions: ActionId[];
  needsDiagnosis: boolean;
};

export type ActionId =
  | "open_spec"
  | "open_video"
  | "open_presentation"
  | "show_product_system"
  | "start_diagnosis"
  | "sales_simulation"
  | "copy_answer"
  | "search_knowledge"
  | "training_center";

export type KnowledgeSource = {
  id: string;
  title: string;
  category: string;
  manufacturer?: string;
  product?: string;
  documentType:
    | "tech_spec"
    | "catalog"
    | "application_guide"
    | "presentation"
    | "video"
    | "research"
    | "qa_approved"
    | "comparison"
    | "product_sheet";
  language: "he" | "en" | "mixed";
  url?: string;
  fileUrl?: string;
  videoUrl?: string;
  presentationUrl?: string;
  pageNumber?: number | string;
  sourceDate?: string;
  verifiedAt?: string;
  verificationStatus: "verified" | "pending" | "unverified";
  approvedBy?: string;
  keywords: string[];
  summary?: string;
};

export type DiagnosisField =
  | "workType"
  | "substrateType"
  | "substrateCondition"
  | "indoorOutdoor"
  | "exposure"
  | "dimensions"
  | "requestedProduct"
  | "problemToSolve"
  | "budgetConstraint";

export type DiagnosisState = {
  active: boolean;
  currentField?: DiagnosisField;
  answers: Partial<Record<DiagnosisField, string>>;
  completed: boolean;
};

export type CrossSellItem = {
  sku?: string;
  name: string;
  reason: string;
  condition: string;
  obligation: "required" | "recommended" | "optional";
  source: string;
  customerExplanation: string;
};

export type SmartAnswerCard = {
  title: string;
  shortAnswer: string;
  explanation?: string;
  steps?: string[];
  technicalData?: { label: string; value: string; source?: string }[];
  diagnosisQuestions?: string[];
  crossSell?: CrossSellItem[];
  sources: KnowledgeSource[];
  actions: { id: ActionId; label: string; href?: string; payload?: string }[];
  disclaimer?: string;
  intent: IntentResult;
};

export type SimulationRole =
  | "cheap_buyer"
  | "uncertain_contractor"
  | "wrong_product"
  | "cross_sell_resist"
  | "price_compare";

export type SimulationState = {
  active: boolean;
  role: SimulationRole;
  turn: number;
  history: { role: "customer" | "agent"; text: string }[];
  score?: {
    diagnosisQuality: number;
    needUnderstanding: number;
    infoAccuracy: number;
    solutionFit: number;
    crossSellJustification: number;
    communication: number;
    overall: number;
    feedback: string[];
  };
};
