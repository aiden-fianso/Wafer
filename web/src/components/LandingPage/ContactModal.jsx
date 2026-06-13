import React, { useState, useEffect } from "react";

export default function ContactModal({ open, onClose }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    // No backend in this build: open the user's mail client with a draft.
    const body = `From: ${name} <${email}>\n\n${message}`;
    const mailto = `mailto:hello@wafer.xyz?subject=${encodeURIComponent(`Wafer contact — ${name}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setName("");
    setEmail("");
    setMessage("");
    onClose();
  };

  return (
    <div
      className={`modal-backdrop${open ? " open" : ""}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-content">
        <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        <div className="modal-header">
          <h3>Contact us</h3>
          <p>Drop your details and we'll get back to you about Wafer, partnerships, or anything else.</p>
        </div>
        <form className="modal-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="modalName">Name</label>
            <input id="modalName" type="text" placeholder="Satoshi Nakamoto" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="modalEmail">Email</label>
            <input id="modalEmail" type="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="modalMessage">Message</label>
            <textarea id="modalMessage" rows="4" placeholder="What's on your mind?" required value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <button type="submit" className="modal-submit">Send message</button>
        </form>
      </div>
    </div>
  );
}
