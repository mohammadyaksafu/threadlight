// Bangla templates for the report, driven by the engine's check codes (no translation model).
// The wording needs review by a native speaker before real use (see BN.note).

import { dayNumber, type Alert, type Data, type RequirementResult, type Result } from "@/engine";
import { SAMPLE } from "@/data/sample";
import { ALERT_LABEL } from "@/lib/vocab";

export function reasonsBn(r: RequirementResult, data: Data, result: Result): string[] {
  const docs = new Map(data.documents.map((d) => [d.id, d] as const));
  const spec = SAMPLE.requirements.find((x) => x.id === r.id)!;
  const out: string[] = [];
  for (const c of r.checks) {
    const lbl = SAMPLE.evidence_types[c.type].label_bn;
    if (c.code === "missing" || !c.doc) { out.push(`ফাইলে কোনো ${lbl} পাওয়া যায়নি।`); continue; }
    const d = docs.get(c.doc)!, head = `${c.doc} ${lbl} (${d.ref})`;
    if (c.code === "expired") out.push(`${head} এর মেয়াদ ${d.valid_until} তারিখে শেষ হয়েছে।`);
    else if (c.code === "expires_before_audit") out.push(`${head} এর মেয়াদ ${d.valid_until} তারিখে শেষ হবে, যা অডিটের (${data.audit_date}) আগে।`);
    else if (c.code === "too_old") out.push(`${head} অডিটের ${dayNumber(data.audit_date) - dayNumber(d.issued)} দিন আগে জারি হয়েছে; সীমা ${spec.max_age_days?.[c.type]} দিন।`);
    else if (c.state === "no_expiry") out.push(`${head} ফাইলে আছে (মেয়াদের তারিখ নেই)।`);
    else out.push(`${head} ${d.valid_until} পর্যন্ত বৈধ, অর্থাৎ অডিটের দিন (${data.audit_date}) বৈধ থাকবে।`);
  }
  if (r.status === "pending_review") {
    for (const c of r.checks) if (c.doc && !docs.get(c.doc)!.verified) out.push(`${c.doc} নতুন আপলোড করা নথি; এখনো কোনো ব্যক্তি অনুমোদন করেননি।`);
  }
  for (const id of r.alerts) {
    const a = result.alerts.find((x) => x.id === id)!;
    out.push(`প্রমাণ-সংগতি সতর্কতা ${id} (${ALERT_LABEL[a.type].bn}) এই শর্তে প্রযোজ্য।`);
  }
  return out;
}

export function alertBn(a: Alert, data: Data): string {
  const docs = new Map(data.documents.map((d) => [d.id, d] as const));
  const sId = a.subject[0], d = sId ? docs.get(sId) : undefined;
  switch (a.type) {
    case "entity_mismatch":
      return `${sId} নথিতে প্রতিষ্ঠানের নাম "${d?.entity}", যা কারখানার নাম "${data.factory}" থেকে ভিন্ন${a.severity === "medium" ? " (সম্ভাব্য বানান ভিন্নতা)।" : "।"}`;
    case "reference_mismatch": {
      const rel = docs.get(a.related[0])!;
      const cited = d?.cites.find((c) => c.of_type === rel.type);
      return `${sId} নথিতে ${cited?.ref ?? ""} উল্লেখ আছে, কিন্তু ফাইলে থাকা ${SAMPLE.evidence_types[rel.type].label_bn} (${rel.id}) এর নম্বর ${rel.ref}।`;
    }
    case "closure_without_proof": {
      const cap = data.corrective_actions.find((c) => c.requirement && a.requirements.includes(c.requirement));
      return `${cap?.id ?? ""} সম্পন্ন হিসেবে চিহ্নিত, কিন্তু সমাপ্তির কোনো প্রমাণ সংযুক্ত নেই।`;
    }
    case "invalid_dates":
      return `${sId} নথির তারিখে অসংগতি রয়েছে।`;
    case "missing_reference":
      return `${sId} এমন একটি নথি উল্লেখ করেছে যা ফাইলে নেই।`;
  }
}
