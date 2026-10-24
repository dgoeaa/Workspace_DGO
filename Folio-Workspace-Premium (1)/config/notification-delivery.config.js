export const NotificationDeliveryPolicy=Object.freeze({serviceMailbox:'dgsregistry@nitda.gov.ng',connectionIdentity:'TENANT_VERIFICATION_REQUIRED',recurrence:{enabled:false,reason:'Tenant deployment required'},retry:{maxAttempts:null,delaysMinutes:[],decisionRequired:true},idempotency:{required:true,keyParts:['requirementId','entityId','eventVersion','recipient']},forbiddenTransactionalFallbacks:['000000','REF-UNSPECIFIED','#','(subject not supplied)','Designated Officer'],prohibitedFixedPersonalRecipients:['hkani@nitda.gov.ng']});
export const MandatoryTokens=Object.freeze({'nitda-dp-02-verification-code':['Compose_Verification_Code','Compose_Recipient_Email'],'nitda-ip-11-official-correspondence':['Compose_Reference_Id','Compose_Recipient_Address','Compose_Subject']});
export function validateNotificationInput({templateId,recipient,tokens={}}){const errors=[];if(!/^\S+@\S+\.\S+$/.test(String(recipient||'')))errors.push('valid recipient is required');for(const key of MandatoryTokens[templateId]||[])if(!String(tokens[key]??'').trim()||NotificationDeliveryPolicy.forbiddenTransactionalFallbacks.includes(String(tokens[key]).trim()))errors.push(`${key} is missing or uses a forbidden fallback`);if(NotificationDeliveryPolicy.prohibitedFixedPersonalRecipients.includes(String(recipient).toLowerCase()))errors.push('personal fixed recipient is prohibited');return {ok:!errors.length,errors};}

/* Staff notices sent by the Workspace itself (register ITEM-51; notification matrix RN-012, RN-015, RN-017, RN-018,
   RN-019, RN-034 and RN-036). core/staff-notice-service.js sends each one through the EMAIL endpoint (IP_SEND_EMAIL),
   which writes an outbox receipt for every send.

   THE COMMISSIONING HOLD. Owner rule: no staff mail before commissioning. `recipients` is the one switch:
     'registry'  every staff notice goes to `registryMailbox`, with a banner naming the officer it is meant for
                 (the same hold the scheduled sweep keeps with Flow Configuration NOTIFY_SWEEP_RECIPIENTS);
     'staff'     every staff notice goes to the officer it is meant for.
   To switch at commissioning: change `recipients` below from 'registry' to 'staff', commit, and redeploy the Workspace.
   Nothing else changes: no flow, package or config.local.js is involved. A notice with no address for its officer is
   never sent in either mode; the operator is told so. */
export const StaffNoticeDelivery=Object.freeze({
  recipients:'registry', /* held 2026-10-19 (owner): no automated staff mail until the owner has finished testing and switches it on; commissioned 'staff' 2026-10-18 */
  registryMailbox:NotificationDeliveryPolicy.serviceMailbox,
  carrier:'EMAIL',
});
