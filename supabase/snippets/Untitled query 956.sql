CREATE TABLE permit_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  jurisdiction_id UUID REFERENCES jurisdictions(id),
  authority_profile_id UUID REFERENCES authority_profiles(id),
  requires_pe BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);