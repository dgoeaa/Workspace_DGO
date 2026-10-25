import { CategoryMatrix } from './category-matrix.config.js';
import { mailboxFor } from './organizational-units.config.js';

/* The approved matrix records Priority in agency vocabulary; the runtime uses its own. */
const PRIORITY = Object.freeze({ low: 'low', medium: 'normal', normal: 'normal', high: 'high', urgent: 'urgent' });

export const AssignmentCascadeConfig = Object.freeze({
  schema: 'dgo-assignment-cascade/v1',
  storageKey: 'DGO_R11_6_ASSIGNMENT_DRAFTS_V1',
  maxRecentDrafts: 50,
  defaultAckDays: 2,
  defaultDueDays: 5,
  dueByPriority: Object.freeze({ low: 10, normal: 5, high: 3, urgent: 1 }),
  categoryFieldAliases: Object.freeze({
    category: ['category','Category','Title','title','CATEGORY'],
    categoryCode: ['categoryCode','CategoryCode','Category Code','Code','CODE','CatCode'],
    subcategory: ['subcategory','Subcategory','SubCategory','Sub Category','SUBCATEGORY'],
    subcategoryCode: ['subcategoryCode','SubcategoryCode','SubCategoryCode','SubCategory Code','SubCode','SUBCODE'],
    dsuKey: ['dsuKey','DSU_KEY','DefaultPrimaryResponsible','Default Primary Responsible','primaryResponsible','ResponsibleDSU','DSU'],
    supportDsuKey: ['supportDsuKey','SupportDSU','SupportDsu','DefaultSupportResponsible','Default Supporting Department/Unit','SupportingDSU'],
    infoDsu: ['infoDsu','InformDSU','INFORMDSU1','INFORMDSU2','INFORMDSU3','InformDSU1','InformDSU2','InformDSU3'],
    assignedTo: ['assignedTo','AssignedTo','AssignedToEmail','DSU_HeadEmail','HeadEmail','DefaultAssignee','OwnerEmail'],
    supportingAssignee: ['supportingAssignee','SupportingAssignee','SupportAssignedTo','SupportAssignedToEmail','DefaultSupportAssignee'],
    copyTo: ['copyTo','CopyToList','CopyTo','CC','Cc','ccRecipients'],
    priority: ['priority','Priority','DefaultPriority'],
    ackDays: ['ackDays','AckDays','AcknowledgementDays','AckDueDays'],
    dueDays: ['dueDays','DueDays','TaskDueDays','SlaDays'],
    instruction: ['instruction','Instruction','DefaultInstruction','Comments','commentTemplate']
  }),
  /* The approved operating model. Agency approval of 2026-09-08 closes MANUAL-1.
     Derived from config/category-matrix.config.js rather than restated here, so the matrix has
     exactly one definition and this file cannot drift from it. assignedTo resolves to the unit's
     ROLE mailbox; the person holding that post is resolved at runtime from DGO_UserDirectory,
     never from configuration. */
  fallbackMatrix: Object.freeze(CategoryMatrix.map(r => Object.freeze({
    category: r.category,
    categoryCode: r.categoryCode,
    subcategory: r.subcategory,
    subcategoryCode: r.subcategoryCode,
    dsuKey: r.dsuKey,
    assignedTo: mailboxFor(r.dsuKey),
    supportDsuKey: r.supportDsuKey,
    informDsu: r.informDsu,
    priority: PRIORITY[r.priority.toLowerCase()] || 'normal',
    /* SPT and EPT as the agency recorded them. A row they recorded as "Ongoing" has no number,
       and takes the documented default rather than an invented one. */
    ackDays: r.ackDays === null ? 2 : r.ackDays,
    dueDays: r.dueDays === null ? 5 : r.dueDays,
    instruction: r.description || `Treat this ${r.subcategory || r.category} item and update tracking.`,
  }))),
  validation: Object.freeze({ requireCategory:true, requireSubcategory:false, requireAssignedTo:true, requireDue:true, requireInstruction:true, enforceAckBeforeDue:true, enforceStartBeforeDue:true })
});
