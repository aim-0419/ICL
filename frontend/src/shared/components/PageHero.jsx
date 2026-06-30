import React from "react";

export function PageHero({ kicker, title, description, children }) {
  return (
    <section className="content-hero">
      {kicker && <p className="section-kicker">{kicker}</p>}
      <h1>{title}</h1>
      {description && <p className="section-text">{description}</p>}
      {children}
    </section>
  );
}
