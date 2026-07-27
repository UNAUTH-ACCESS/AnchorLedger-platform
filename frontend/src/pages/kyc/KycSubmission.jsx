import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { kyc as kycApi } from "../../api/endpoints";
import { colors } from "../../lib/tokens";
import useAuthStore from "../../store/auth.store";

// ── Country list (common full names, alphabetical) ──────────────────────────
const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia",
  "Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados",
  "Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina",
  "Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cambodia",
  "Cameroon","Canada","Chad","Chile","China","Colombia","Costa Rica","Croatia",
  "Cuba","Cyprus","Czech Republic","Denmark","Dominican Republic","Ecuador",
  "Egypt","El Salvador","Estonia","Ethiopia","Fiji","Finland","France","Gabon",
  "Gambia","Georgia","Germany","Ghana","Greece","Guatemala","Guyana","Haiti",
  "Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland",
  "Israel","Italy","Ivory Coast","Jamaica","Japan","Jordan","Kazakhstan","Kenya",
  "Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya",
  "Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia",
  "Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Monaco",
  "Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nepal",
  "Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea",
  "North Macedonia","Norway","Oman","Pakistan","Panama","Papua New Guinea",
  "Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania",
  "Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Singapore","Slovakia",
  "Slovenia","Somalia","South Africa","South Korea","South Sudan","Spain",
  "Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan",
  "Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia",
  "Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates",
  "United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam",
  "Yemen","Zambia","Zimbabwe",
];

const ID_TYPES = ["Passport", "Driver's License", "National ID Card", "Residence Permit"];

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"];

// ── Reusable primitives (mirrors onboarding's form conventions) ─────────────
function Label({ children, required }) {
  return (
    <div style={{ fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
      {children}{required && <span style={{ color: colors.red }}> *</span>}
    </div>
  );
}

const inputStyle = {
  width: "100%", background: colors.surface2, border: `1px solid ${colors.border2}`,
  borderRadius: 6, padding: "10px 12px", fontSize: 13, color: colors.text,
  fontFamily: "inherit", boxSizing: "border-box",
};

function TextField({ label, required, ...props }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input style={inputStyle} {...props} />
    </div>
  );
}

function SelectField({ label, required, options, ...props }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <select style={inputStyle} {...props}>
        <option value="">Select…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function validateFile(file) {
  if (!file) return null;
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only JPEG, PNG, or PDF files are accepted.";
  if (file.size > MAX_FILE_BYTES) return "File must be under 8MB.";
  return null;
}

function FileUpload({ label, required, file, onChange, error }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    if (file.type === "application/pdf") { setPreview("pdf"); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <Label required={required}>{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      <div
        onClick={() => inputRef.current?.click()}
        style={{
          border: `1px dashed ${error ? colors.red : colors.border2}`,
          borderRadius: 6, padding: 16, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 12,
          background: colors.surface2,
        }}
      >
        {preview === "pdf" ? (
          <div style={{ width: 44, height: 44, borderRadius: 4, background: colors.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: colors.muted, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
            PDF
          </div>
        ) : preview ? (
          <img src={preview} alt={label} style={{ width: 44, height: 44, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}/>
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 4, background: colors.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: colors.muted, flexShrink: 0 }}>
            +
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: file ? colors.text : colors.muted }}>
            {file ? file.name : "Tap to upload"}
          </div>
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}>
            JPEG, PNG, or PDF · up to 8MB
          </div>
        </div>
      </div>
      {error && <div style={{ fontSize: 10, color: colors.red, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function Checkbox({ checked, onChange, children }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: colors.green }}
      />
      <span style={{ fontSize: 12, color: colors.muted, lineHeight: 1.5 }}>{children}</span>
    </label>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Status screen (already submitted / reviewed) ────────────────────────────
const STATUS_META = {
  PENDING_REVIEW: { label: "Pending Review", color: colors.orange, desc: "Your submission is with our compliance team. This usually takes 1-2 business days." },
  APPROVED:       { label: "Approved",       color: colors.green,  desc: "Your identity has been verified. You're all set to trade." },
  REJECTED:       { label: "Rejected",       color: colors.red,    desc: "Your submission was rejected. See the notes below, or contact support." },
};

function StatusScreen({ status, submittedAt, reviewedAt, reviewNotes }) {
  const meta = STATUS_META[status];
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, padding: 24, textAlign: "center" }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", margin: "0 auto 16px",
          background: meta.color + "22", border: `1px solid ${meta.color}55`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, color: meta.color,
        }}>
          {status === "APPROVED" ? "✓" : status === "REJECTED" ? "✕" : "⏳"}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: meta.color, marginBottom: 8 }}>{meta.label}</div>
        <div style={{ fontSize: 13, color: colors.muted, lineHeight: 1.6 }}>{meta.desc}</div>
        {submittedAt && (
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 16, fontFamily: "'JetBrains Mono', monospace" }}>
            Submitted {new Date(submittedAt).toLocaleDateString()}
          </div>
        )}
        {reviewNotes && (
          <div style={{ marginTop: 16, padding: 12, background: colors.surface2, border: `1px solid ${colors.border2}`, borderRadius: 6, fontSize: 12, color: colors.muted, textAlign: "left" }}>
            <strong style={{ color: colors.text }}>Notes: </strong>{reviewNotes}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function KycSubmission() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [checkingStatus, setCheckingStatus] = useState(true);
  const [existingStatus, setExistingStatus] = useState(null);
  const [statusDetail, setStatusDetail] = useState({});

  const [form, setForm] = useState({
    legalName: user?.name || "",
    dateOfBirth: "",
    countryResidence: "",
    countryCitizenship: "",
    address: "",
    idType: "",
    idNumber: "",
  });
  const [idDocFront, setIdDocFront] = useState(null);
  const [idDocBack, setIdDocBack] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [attestations, setAttestations] = useState({ notPep: false, noSanctions: false, accurate: false });

  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    kycApi.status()
      .then(res => {
        const { status, submittedAt, reviewedAt, reviewNotes } = res.data;
        setExistingStatus(status);
        setStatusDetail({ submittedAt, reviewedAt, reviewNotes });
      })
      .catch(() => setExistingStatus("NOT_SUBMITTED"))
      .finally(() => setCheckingStatus(false));
  }, []);

  function setField(key, value) {
    setForm(f => ({ ...f, [key]: value }));
    setFieldErrors(e => ({ ...e, [key]: null }));
  }

  function validate() {
    const errs = {};
    if (!form.legalName.trim()) errs.legalName = "Required";
    if (!form.dateOfBirth) errs.dateOfBirth = "Required";
    else {
      const age = (Date.now() - new Date(form.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (age < 18) errs.dateOfBirth = "Must be 18 or older";
    }
    if (!form.countryResidence) errs.countryResidence = "Required";
    if (!form.countryCitizenship) errs.countryCitizenship = "Required";
    if (!form.address.trim()) errs.address = "Required";
    if (!form.idType) errs.idType = "Required";
    if (!form.idNumber.trim()) errs.idNumber = "Required";

    const frontErr = validateFile(idDocFront);
    if (!idDocFront) errs.idDocFront = "Required";
    else if (frontErr) errs.idDocFront = frontErr;

    if (idDocBack) {
      const backErr = validateFile(idDocBack);
      if (backErr) errs.idDocBack = backErr;
    }

    const selfieErr = validateFile(selfie);
    if (!selfie) errs.selfie = "Required";
    else if (selfieErr) errs.selfie = selfieErr;

    if (!attestations.notPep || !attestations.noSanctions || !attestations.accurate) {
      errs.attestations = "All three attestations must be confirmed";
    }

    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("legalName", form.legalName.trim());
      fd.append("dateOfBirth", form.dateOfBirth);
      fd.append("countryResidence", form.countryResidence);
      fd.append("countryCitizenship", form.countryCitizenship);
      fd.append("address", form.address.trim());
      fd.append("idType", form.idType);
      fd.append("idNumber", form.idNumber.trim());
      fd.append("attestNotPep", "true");
      fd.append("attestNoSanctions", "true");
      fd.append("attestAccurate", "true");
      fd.append("idDocFront", idDocFront);
      if (idDocBack) fd.append("idDocBack", idDocBack);
      fd.append("selfie", selfie);

      const res = await kycApi.submit(fd);
      setExistingStatus(res.data.status);
      setStatusDetail({ submittedAt: res.data.submittedAt });
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || "Submission failed. Please try again.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingStatus) {
    return <div style={{ padding: 40, textAlign: "center", color: colors.muted, fontSize: 13 }}>Loading…</div>;
  }

  if (existingStatus && existingStatus !== "NOT_SUBMITTED") {
    return <StatusScreen status={existingStatus} {...statusDetail} />;
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 60px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: colors.text, marginBottom: 6 }}>Identity Verification</h1>
        <p style={{ fontSize: 12, color: colors.muted, lineHeight: 1.6, margin: 0 }}>
          Required once before you can start trading. A human reviewer checks every submission —
          no automated approval or rejection.
        </p>
      </div>

      <SectionCard title="Personal Information">
        <TextField label="Legal Name" required placeholder="As shown on your ID"
          value={form.legalName} onChange={e => setField("legalName", e.target.value)} />
        {fieldErrors.legalName && <div style={{ fontSize: 10, color: colors.red, marginTop: -8 }}>{fieldErrors.legalName}</div>}

        <TextField label="Date of Birth" required type="date"
          value={form.dateOfBirth} onChange={e => setField("dateOfBirth", e.target.value)} />
        {fieldErrors.dateOfBirth && <div style={{ fontSize: 10, color: colors.red, marginTop: -8 }}>{fieldErrors.dateOfBirth}</div>}

        <SelectField label="Country of Residence" required options={COUNTRIES}
          value={form.countryResidence} onChange={e => setField("countryResidence", e.target.value)} />
        {fieldErrors.countryResidence && <div style={{ fontSize: 10, color: colors.red, marginTop: -8 }}>{fieldErrors.countryResidence}</div>}

        <SelectField label="Country of Citizenship" required options={COUNTRIES}
          value={form.countryCitizenship} onChange={e => setField("countryCitizenship", e.target.value)} />
        {fieldErrors.countryCitizenship && <div style={{ fontSize: 10, color: colors.red, marginTop: -8 }}>{fieldErrors.countryCitizenship}</div>}

        <TextField label="Residential Address" required placeholder="Street, city, state/province, postal code"
          value={form.address} onChange={e => setField("address", e.target.value)} />
        {fieldErrors.address && <div style={{ fontSize: 10, color: colors.red, marginTop: -8 }}>{fieldErrors.address}</div>}
      </SectionCard>

      <SectionCard title="Identity Document">
        <SelectField label="ID Type" required options={ID_TYPES}
          value={form.idType} onChange={e => setField("idType", e.target.value)} />
        {fieldErrors.idType && <div style={{ fontSize: 10, color: colors.red, marginTop: -8 }}>{fieldErrors.idType}</div>}

        <TextField label="ID Number" required placeholder="Document number"
          value={form.idNumber} onChange={e => setField("idNumber", e.target.value)} />
        {fieldErrors.idNumber && <div style={{ fontSize: 10, color: colors.red, marginTop: -8 }}>{fieldErrors.idNumber}</div>}

        <FileUpload label="ID Front" required file={idDocFront} error={fieldErrors.idDocFront}
          onChange={(f) => { setIdDocFront(f); setFieldErrors(e => ({ ...e, idDocFront: null })); }} />

        <FileUpload label="ID Back (if applicable)" file={idDocBack} error={fieldErrors.idDocBack}
          onChange={(f) => { setIdDocBack(f); setFieldErrors(e => ({ ...e, idDocBack: null })); }} />

        <FileUpload label="Selfie" required file={selfie} error={fieldErrors.selfie}
          onChange={(f) => { setSelfie(f); setFieldErrors(e => ({ ...e, selfie: null })); }} />
      </SectionCard>

      <SectionCard title="Attestations">
        <Checkbox checked={attestations.notPep} onChange={(v) => setAttestations(a => ({ ...a, notPep: v }))}>
          I am not a politically exposed person (PEP), nor a close associate or family member of one.
        </Checkbox>
        <Checkbox checked={attestations.noSanctions} onChange={(v) => setAttestations(a => ({ ...a, noSanctions: v }))}>
          I am not subject to any sanctions, and I am not a resident of a sanctioned jurisdiction.
        </Checkbox>
        <Checkbox checked={attestations.accurate} onChange={(v) => setAttestations(a => ({ ...a, accurate: v }))}>
          All information and documents provided above are accurate and belong to me.
        </Checkbox>
        {fieldErrors.attestations && <div style={{ fontSize: 10, color: colors.red }}>{fieldErrors.attestations}</div>}
      </SectionCard>

      {submitError && (
        <div style={{ fontSize: 12, color: colors.red, background: "#FF4D6D11", border: "1px solid #FF4D6D33", borderRadius: 6, padding: "10px 14px" }}>
          {submitError}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        style={{
          background: colors.green, color: colors.bg, border: "none", borderRadius: 6,
          padding: "14px 20px", fontSize: 13, fontWeight: 700, cursor: submitting ? "default" : "pointer",
          opacity: submitting ? 0.6 : 1, letterSpacing: "0.02em",
        }}
      >
        {submitting ? "Submitting…" : "Submit for Review"}
      </button>
    </form>
  );
}
