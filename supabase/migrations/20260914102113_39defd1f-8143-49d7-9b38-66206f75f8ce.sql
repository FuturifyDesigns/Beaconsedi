UPDATE public.hospitals SET name='Princess Marina Hospital', latitude=-24.65400, longitude=25.91100 WHERE id='bc005757-f54e-4fa9-9c0a-c5196f787fe3';
UPDATE public.hospitals SET name='Gaborone Private Hospital', latitude=-24.65280, longitude=25.92310 WHERE id='6c70248f-3351-4584-8a45-35abffdac71b';
UPDATE public.hospitals SET name='Bokamoso Private Hospital', latitude=-24.60390, longitude=25.88280 WHERE id='0f6be56f-dc18-42e8-9bbf-cf610080be9c';
UPDATE public.hospitals SET name='Sidilega Private Hospital', latitude=-24.56550, longitude=25.93400 WHERE id='65f0c014-a108-4362-8f22-5f805eaf7ba9';

UPDATE public.responder_units SET latitude=-24.6580, longitude=25.9080 WHERE call_sign='AMB-01';
UPDATE public.responder_units SET latitude=-24.6412, longitude=25.9245 WHERE call_sign='AMB-02';
UPDATE public.responder_units SET latitude=-24.6702, longitude=25.9160 WHERE call_sign='AMB-03';
UPDATE public.responder_units SET latitude=-24.6490, longitude=25.8955 WHERE call_sign='POL-07';
UPDATE public.responder_units SET latitude=-24.6288, longitude=25.9320 WHERE call_sign='POL-12';
UPDATE public.responder_units SET latitude=-24.6605, longitude=25.9310 WHERE call_sign='FIRE-03';
UPDATE public.responder_units SET latitude=-24.6350, longitude=25.9020 WHERE call_sign='RSC-01';
UPDATE public.responder_units SET name='Air Ambulance Kalahari', call_sign='AIR-B1', latitude=-24.5552, longitude=25.9182 WHERE call_sign='AIR-K1';

UPDATE public.alerts SET latitude = -24.6282 + (latitude + 1.2864), longitude = 25.9231 + (longitude - 36.8172) WHERE latitude BETWEEN -2 AND 0 AND longitude BETWEEN 36 AND 38;