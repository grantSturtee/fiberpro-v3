ALTER TABLE jurisdictions 
ADD COLUMN authority_profile_id UUID REFERENCES authority_profiles(id);