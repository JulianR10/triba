-- Editions
insert into public.editions (id, edition_number, title, description, cover_url, pdf_url, featured, badge, published_at) values
  (1, 1, 'La vida empieza muchas veces', 'Hicimos realidad nuestro sueño a través de esta primer edición de la revista, ¡bienvenida!', '/assets-images-tomos/triba-tomo1.webp', '#', false, null, '2025-01-01'),
  (2, 2, 'Creamos porque creemos', 'Damos la bienvenida a las Tribu Creators y compartimos con ustedes 15 artículos que nos hacen mucha ilusión.', '/assets-images-tomos/triba-tomo2.webp', '#', false, null, '2025-02-01'),
  (3, 3, 'El show debe continuar', E'Estamos felices de compartir con ustedes la tercer edición de nuestra revista!\n\nCon la participación de las colaboradoras fundadoras y algunas Triba Creators que se suman este mes.\n\n"El show debe continuar" viene a recordarnos un poco quienes fuimos y quienes somos hoy, transitando por 15 artículos diferentes pero igual de inspiradores.\n\nEsperamos que disfrutes tu lectura, nos vemos el mes que viene', '/assets-images-tomos/triba-tomo3.webp', '#', true, 'Última edición', '2025-03-01');

-- Edition pages
insert into public.edition_pages (edition_id, page_number, image_url, alt_text) values
  (3, 1, '/assets-images-tomos/triba-tomo3.webp', 'Página 1 - Portada'),
  (3, 2, '/assets-images-tomos/triba-tomo2.webp', 'Página 2 - Artículo'),
  (3, 3, '/assets-images-tomos/triba-tomo1.webp', 'Página 3 - Artículo'),
  (3, 4, '/assets-images-tomos/triba-tomo3.webp', 'Página 4 - Artículo'),
  (2, 1, '/assets-images-tomos/triba-tomo2.webp', 'Portada edición 2'),
  (1, 1, '/assets-images-tomos/triba-tomo1.webp', 'Portada edición 1');
