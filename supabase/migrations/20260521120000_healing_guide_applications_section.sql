-- applications section_type + yanlış reasons kayıtlarını düzelt

alter table public.healing_guide_sections
  drop constraint if exists healing_guide_sections_section_type_check;

alter table public.healing_guide_sections
  add constraint healing_guide_sections_section_type_check
  check (
    section_type in (
      'reasons',
      'applications',
      'herbal',
      'stones_details',
      'islamic_suggestions',
      'supportive'
    )
  );

update public.healing_guide_sections
set
  section_type = 'applications',
  title = coalesce(nullif(trim(title), ''), 'Hacamat & Sülük')
where section_type = 'reasons'
  and lower(trim(coalesce(mode, ''))) in ('hacamat_suluk', 'hacamat', 'cupping_leech');

update public.healing_guide_sections
set
  section_type = 'applications',
  title = coalesce(nullif(trim(title), ''), 'Diyet Önerileri')
where section_type = 'reasons'
  and lower(trim(coalesce(mode, ''))) in ('diyet', 'diet_recommendations');

update public.healing_guide_sections
set
  section_type = 'applications',
  title = coalesce(nullif(trim(title), ''), 'Refleksoloji')
where section_type = 'reasons'
  and lower(trim(coalesce(mode, ''))) in ('refleksoloji', 'reflexology');

update public.healing_guide_sections
set
  section_type = 'applications',
  title = coalesce(nullif(trim(title), ''), 'Uygulama')
where section_type = 'reasons'
  and lower(trim(coalesce(mode, ''))) = 'uygulama';

update public.healing_guide_sections
set
  section_type = 'applications',
  title = coalesce(nullif(trim(title), ''), 'Masaj')
where section_type = 'reasons'
  and lower(trim(coalesce(mode, ''))) = 'masaj';

update public.healing_guide_sections
set
  section_type = 'applications',
  title = coalesce(nullif(trim(title), ''), 'Nefes')
where section_type = 'reasons'
  and lower(trim(coalesce(mode, ''))) in ('nefes', 'breathwork');

update public.healing_guide_sections
set
  section_type = 'applications',
  title = coalesce(nullif(trim(title), ''), 'Biyoenerji')
where section_type = 'reasons'
  and lower(trim(coalesce(mode, ''))) in ('bioenerji', 'bioenergy');
