import './home.css'
import placa from '../assets/placa1.png'
import placa1 from '../assets/PlacaAislamiento.png'
import placa2 from '../assets/aislante.png'
import placa3 from '../assets/panel-de-residuos-textiles-reciclados.1_f.jpg'
import type { ReactElement } from 'react'

interface HomeProps {
  page?: number
}

export function Home({ page = 1 }: HomeProps) {
  const pages: Record<number, ReactElement> = {
    1: (
      <main className="home-page">
        <section id='block'>
          <div className='block1 struct'>
            <div className='block-struct'>
              <div className='txtBlock1'>
                <h4>Aislante Termico y Placas a Partir de Textiles Reciclados.</h4>
                <p>Inovacion sostenible para la construccion y la industria.  Soluciones eficaces, ecologicas y de alta calidad</p>
              </div>
              <div className='imgBlock1'>
                <img src={placa} alt="Placa Textil" />
              </div>
            </div>
          </div>
        </section>
      </main>
    ),
    2: (
      <main className="home-page">
        <section id='block'>
          <div className='block2 struct'>
            <p>Nuestros Productos</p>
            <div className='block2Struct'>
              <div className='b2item1'>
                <img src={placa1} alt="Placa" />
                <div className='itemText'>
                  <h4>Placa textil</h4>
                  <p>Lorem ipsum dolor sit, amet consectetur adipisicing elit. Recusandae consectetur perspiciatis nostrum, officia possimus illo porro cumque fugit voluptate ducimus, sit dolorem distinctio harum a unde autem hic fugiat veritatis!</p>
                </div>
              </div>
              <div className='b2item2'>
                <img src={placa2} alt="Textil" />
                <div className='itemText'>
                  <h4>Lorem</h4>
                  <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Nulla, id unde facilis doloribus consequatur eligendi magnam aliquam quaerat ad! Perferendis molestiae quas officia cum dolore aperiam culpa pariatur delectus quasi?</p>
                </div>
              </div>
              <div className='b2item3'>
                <img src={placa3} alt="Horario" />
                <div className='itemText'>
                  <h4>Lorem</h4>
                  <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Nulla, id unde facilis doloribus consequatur eligendi magnam aliquam quaerat ad! Perferendis molestiae quas officia cum dolore aperiam culpa pariatur delectus quasi?</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    ),
    3: (
      <main className="home-page">
        <section id='block'>
          <p>Quienes somos? </p>  
          <div className='block3 struct'></div>
        </section>
      </main>
    ),
  }

  return pages[page] ?? pages[1]
}

export default Home