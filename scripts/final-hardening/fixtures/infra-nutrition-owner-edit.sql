-- INFRA 0700: migration öncesi owner'ın elle değiştirdiği bir ad (ezilmemeli).
UPDATE public.nutrition_allergens SET name_tr = 'Owner Özel' WHERE code = 'fish';
