"""Document templates for the synthetic generator: 8 evidence types, English and Bangla.

Every template returns a list of pages (HTML strings) and the page each ground-truth field is printed on.
All issuers, factories, people and numbers are invented; every page carries a SYNTHETIC footer.
"""

import datetime

BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"]
EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

DATE_FORMATS_EN = ["dmy_slash", "dmy_dash", "d_month_y", "iso", "d_mon_y"]
DATE_FORMATS_BN = ["bn_dmy_slash", "bn_d_month_y"]


def fmt_date(iso: str, style: str) -> str:
    d = datetime.date.fromisoformat(iso)
    if style == "dmy_slash":
        return d.strftime("%d/%m/%Y")
    if style == "dmy_dash":
        return d.strftime("%d-%m-%Y")
    if style == "d_month_y":
        return "%d %s %d" % (d.day, EN_MONTHS[d.month - 1], d.year)
    if style == "d_mon_y":
        return "%02d-%s-%d" % (d.day, EN_MONTHS[d.month - 1][:3], d.year)
    if style == "iso":
        return iso
    if style == "bn_dmy_slash":
        return d.strftime("%d/%m/%Y").translate(BN_DIGITS)
    if style == "bn_d_month_y":
        return ("%d %s %d" % (d.day, BN_MONTHS[d.month - 1], d.year)).translate(BN_DIGITS)
    raise ValueError(style)


FOOTER_EN = "SYNTHETIC DOCUMENT generated for the ThreadLight prototype. Not a real certificate."
FOOTER_BN = "কৃত্রিম নথি — ThreadLight প্রোটোটাইপের জন্য তৈরি। আসল সনদ নয়।"

FILLER_EN = [
    "The inspection team visited all production floors, the cutting section, the finishing section and the store.",
    "Emergency lighting, exit signage and the fire alarm panel were tested in the presence of factory management.",
    "Load-bearing columns on floors 1 to 4 were checked for cracks; no new cracks were recorded since the last visit.",
    "The electrical distribution boards were found labelled and covered; two loose cable trays were noted for repair.",
    "Workers interviewed during the visit confirmed that evacuation routes are kept clear during working hours.",
    "Chemical storage is separated from the main building and fitted with secondary containment.",
]
FILLER_BN = [
    "পরিদর্শন দল সকল উৎপাদন ফ্লোর, কাটিং সেকশন, ফিনিশিং সেকশন এবং স্টোর পরিদর্শন করেছে।",
    "কারখানা ব্যবস্থাপনার উপস্থিতিতে জরুরি বাতি, বহির্গমন চিহ্ন ও ফায়ার অ্যালার্ম পরীক্ষা করা হয়েছে।",
    "শ্রমিকরা নিশ্চিত করেছেন যে কাজের সময় বহির্গমন পথ খোলা রাখা হয়।",
]


def _page(body: str, footer: str) -> str:
    return '<div class="page"><div class="body">%s</div><div class="footer">%s</div></div>' % (body, footer)


def _kv(label: str, value: str) -> str:
    return '<p class="kv"><span class="k">%s:</span> %s</p>' % (label, value)


# Label variants: different issuers print the same field differently, which is what makes extraction
# non-trivial. Each template draws one label per field from these lists.
LABELS_EN = {
    "fire_certificate": {"title": "Fire Safety Certificate", "issuer": "Fire Service and Civil Defence Directorate (synthetic)",
                         "ref": ["Certificate No", "Fire Licence No", "Ref. No"], "entity": ["Issued to", "Name of Factory"],
                         "issued": ["Date of issue", "Issued on"], "valid_until": ["Valid until", "Expiry date", "Valid till"]},
    "structural_report": {"title": "Structural Assessment Report", "issuer": "Engineering Assessment Cell (synthetic)",
                          "ref": ["Report No", "Assessment Ref"], "entity": ["Prepared for", "Facility"],
                          "issued": ["Assessment completed on", "Date of assessment"], "valid_until": ["This assessment remains valid until", "Next assessment due by"]},
    "trade_license": {"title": "Trade License", "issuer": "City Corporation Revenue Department (synthetic)",
                      "ref": ["License No", "Trade Licence No"], "entity": ["Name of Business", "Business name"],
                      "issued": ["Date of Issue", "Issued"], "valid_until": ["Valid Until", "Expires on"]},
    "env_clearance": {"title": "Environmental Clearance Certificate", "issuer": "Department of Environment (synthetic)",
                      "ref": ["Clearance No", "ECC No"], "entity": ["Name of the industrial unit", "Unit"],
                      "issued": ["Date of issue", "Issued on"], "valid_until": ["Validity", "Valid up to"]},
    "fire_drill_record": {"title": "Fire Drill Record", "issuer": "Factory Safety Committee",
                          "ref": ["Log ref", "Record No"], "entity": ["Factory", "Facility"],
                          "issued": ["Drill conducted on", "Date of drill"], "valid_until": None},
    "payroll_summary": {"title": "Payroll and Working-Hour Summary", "issuer": "HR & Payroll Department",
                        "ref": ["Summary ref", "Document No"], "entity": ["Employer", "Factory"],
                        "issued": ["Prepared on", "Date prepared"], "valid_until": None},
    "committee_minutes": {"title": "Safety Committee Minutes", "issuer": "Safety Committee",
                          "ref": ["Minutes ref", "Ref"], "entity": ["Factory", "Facility"],
                          "issued": ["Meeting held on", "Date of meeting"], "valid_until": None},
    "cap_closure_evidence": {"title": "Corrective Action Closure Note", "issuer": "Compliance Department",
                             "ref": ["Closure ref", "Note No"], "entity": ["Factory", "Facility"],
                             "issued": ["Verified on", "Date of verification"], "valid_until": None},
}
LABELS_BN = {
    "fire_certificate": {"title": "অগ্নি নিরাপত্তা সনদ", "issuer": "ফায়ার সার্ভিস ও সিভিল ডিফেন্স অধিদপ্তর (কৃত্রিম)",
                         "ref": ["সনদ নং"], "entity": ["প্রতিষ্ঠানের নাম"], "issued": ["ইস্যুর তারিখ"], "valid_until": ["মেয়াদ উত্তীর্ণের তারিখ"]},
    "structural_report": {"title": "কাঠামোগত মূল্যায়ন প্রতিবেদন", "issuer": "প্রকৌশল মূল্যায়ন সেল (কৃত্রিম)",
                          "ref": ["প্রতিবেদন নং"], "entity": ["প্রতিষ্ঠান"], "issued": ["মূল্যায়নের তারিখ"], "valid_until": ["বৈধ থাকবে"]},
    "trade_license": {"title": "ট্রেড লাইসেন্স", "issuer": "সিটি কর্পোরেশন রাজস্ব বিভাগ (কৃত্রিম)",
                      "ref": ["লাইসেন্স নং"], "entity": ["ব্যবসার নাম"], "issued": ["ইস্যুর তারিখ"], "valid_until": ["মেয়াদ"]},
    "env_clearance": {"title": "পরিবেশগত ছাড়পত্র", "issuer": "পরিবেশ অধিদপ্তর (কৃত্রিম)",
                      "ref": ["ছাড়পত্র নং"], "entity": ["শিল্প প্রতিষ্ঠানের নাম"], "issued": ["ইস্যুর তারিখ"], "valid_until": ["মেয়াদ"]},
    "fire_drill_record": {"title": "অগ্নি মহড়ার রেকর্ড", "issuer": "কারখানা নিরাপত্তা কমিটি",
                          "ref": ["রেকর্ড নং"], "entity": ["কারখানা"], "issued": ["মহড়ার তারিখ"], "valid_until": None},
    "payroll_summary": {"title": "মজুরি ও কর্মঘণ্টার সারসংক্ষেপ", "issuer": "এইচআর ও পে-রোল বিভাগ",
                        "ref": ["নথি নং"], "entity": ["নিয়োগকর্তা"], "issued": ["প্রস্তুতের তারিখ"], "valid_until": None},
    "committee_minutes": {"title": "নিরাপত্তা কমিটির সভার কার্যবিবরণী", "issuer": "নিরাপত্তা কমিটি",
                          "ref": ["কার্যবিবরণী নং"], "entity": ["কারখানা"], "issued": ["সভার তারিখ"], "valid_until": None},
    "cap_closure_evidence": {"title": "সংশোধনমূলক পদক্ষেপ সমাপ্তি নোট", "issuer": "কমপ্লায়েন্স বিভাগ",
                             "ref": ["নোট নং"], "entity": ["কারখানা"], "issued": ["যাচাইয়ের তারিখ"], "valid_until": None},
}

# How many pages each type has, and which page carries which fields.
LAYOUT = {
    "fire_certificate": {"pages": 1, "fields": {"ref": 1, "entity": 1, "issued": 1, "valid_until": 1}},
    "structural_report": {"pages": 4, "fields": {"ref": 1, "entity": 1, "issued": 4, "valid_until": 4}},
    "trade_license": {"pages": 1, "fields": {"ref": 1, "entity": 1, "issued": 1, "valid_until": 1}},
    "env_clearance": {"pages": 2, "fields": {"ref": 2, "entity": 2, "issued": 2, "valid_until": 2}},
    "fire_drill_record": {"pages": 1, "fields": {"ref": 1, "entity": 1, "issued": 1}},
    "payroll_summary": {"pages": 1, "fields": {"ref": 1, "entity": 1, "issued": 1}},
    "committee_minutes": {"pages": 2, "fields": {"ref": 1, "entity": 1, "issued": 1}},
    "cap_closure_evidence": {"pages": 1, "fields": {"ref": 1, "entity": 1, "issued": 1}},
}


def render(doc: dict, rng) -> tuple[list[str], dict]:
    """Return (pages as HTML, {field: quote printed on the page})."""
    bn = doc["lang"] == "bn"
    L = (LABELS_BN if bn else LABELS_EN)[doc["type"]]
    footer = FOOTER_BN if bn else FOOTER_EN
    filler = FILLER_BN if bn else FILLER_EN
    style = doc["date_style"]
    layout = LAYOUT[doc["type"]]
    n = layout["pages"]
    blocks = {p: [] for p in range(1, n + 1)}
    quotes = {}

    def field(name, value):
        label = rng.choice(L[name])
        quotes[name] = "%s: %s" % (label, value)
        blocks[layout["fields"][name]].append(_kv(label, value))

    blocks[1].insert(0, '<p class="issuer">%s</p><h1>%s</h1>' % (L["issuer"], L["title"]))
    field("ref", doc["ref"])
    field("entity", doc["entity"])
    field("issued", fmt_date(doc["issued"], style))
    if doc.get("valid_until"):
        field("valid_until", fmt_date(doc["valid_until"], style))

    t = doc["type"]
    if t == "fire_certificate":
        blocks[1].append("<p>%s</p>" % ("উপরোক্ত প্রতিষ্ঠানকে অগ্নি নিরাপত্তা বিধি অনুযায়ী এই সনদ প্রদান করা হলো।" if bn else
                                        "This is to certify that the premises named above were inspected and meet the fire safety requirements in force on the date of issue."))
    elif t == "committee_minutes":
        cite = doc["cites"][0]["ref"] if doc.get("cites") else None
        blocks[1].append("<p>%s</p>" % ("উপস্থিত: কমিটির ৯ জন সদস্য।" if bn else "Present: 9 committee members, including 5 worker representatives."))
        if cite:
            blocks[2].append("<p>%s</p>" % (("আইটেম ৩: কমিটি অগ্নি নিরাপত্তা সনদ %s এবং বহির্গমন পরিকল্পনা পর্যালোচনা করেছে।" % cite) if bn else
                                            "Item 3: The committee reviewed fire safety certificate %s and the evacuation plan." % cite))
        blocks[2].append("<p>%s</p>" % rng.choice(filler))
    elif t == "fire_drill_record":
        blocks[1].append("<p>%s</p>" % ("সকল শ্রমিক ৪ মিনিট ১০ সেকেন্ডে ভবন ত্যাগ করেছেন।" if bn else
                                        "All workers left the building in 4 minutes 10 seconds. Assembly point head-count matched the attendance register."))
    elif t == "cap_closure_evidence":
        blocks[1].append("<p>%s</p>" % ((("যাচাইকারী: %s, ফোন %s" % (doc["person"], doc["phone"]))) if bn else
                                        "Verified by: %s (phone %s). Dated photographs of the cleared exit are attached." % (doc["person"], doc["phone"])))
    elif t == "payroll_summary":
        blocks[1].append("<p>%s</p>" % ("মোট শ্রমিক: ১,২৪০; গড় সাপ্তাহিক কর্মঘণ্টা: ৫৬।" if bn else
                                        "Workers: 1,240. Average weekly hours: 56. Overtime paid at double the basic hourly rate."))
    else:
        blocks[1].append("<p>%s</p>" % rng.choice(filler))
    if doc.get("injection"):
        blocks[1].append('<p class="small">%s</p>' % doc["injection"])
    if doc.get("person") and t != "cap_closure_evidence":
        blocks[n].append('<p class="sig">%s %s</p>' % ("স্বাক্ষর:" if bn else "Signed:", doc["person"]))
    for p in range(2, n + 1):
        if len(blocks[p]) == 0 or p not in layout["fields"].values():
            blocks[p].append("".join("<p>%s</p>" % rng.choice(filler) for _ in range(3)))
    pages = [_page("".join(blocks[p]), footer + (" — %d/%d" % (p, n))) for p in range(1, n + 1)]
    return pages, quotes
