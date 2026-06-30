

import React, { useEffect, useState } from 'react'
import './App.css'
import logo from './assets/logo.png'
import cube from './assets/cube.svg'
import hause from './assets/house.svg'
import hause2 from './assets/house2.svg'
import pie from './assets/pie.svg'
import shop from './assets/shopping-cart.svg'
import aling from './assets/align.svg'
import placa from './assets/placa1.png'

function App() {
  const [isHeaderHidden, setIsHeaderHidden] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsHeaderHidden(window.scrollY > 0)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <>
      <section id='header' className={isHeaderHidden ? 'hidden' : ''}>
        <h3>INDUSTRIA ARGENTINA - 100% PLÁSTICO RECICLADO</h3>
      </section>
      <section id="nav">
        <div className='logo'>
          <div className='imgLogo'>
            <img src={logo} alt="Logo" />
          </div>
          <div className='txtLogo'>
            <h1>Hilos del</h1>
            <h1>Retorno</h1>
          </div>
        </div>
        <div className='icons'>
          <div className='iconItem'>
            <img src={cube} alt='Cube icon' />
          </div>
          <div className='iconItem'>
            <img src={hause} alt='House icon' />
          </div>
          <div className='iconItem'>
            <img src={hause2} alt='House 2 icon' />
          </div>
          <div className='iconItem'>
            <img src={aling} alt='aling icon' />
          </div>
          <div className='iconItem'>
            <img src={pie} alt='Pie chart icon' />
          </div>
          <div className='iconItem'>
            <img src={shop} alt='Shopping cart icon' />
          </div>
        </div>
      </section>
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
        <div className='block2 struct'>
          <p>Nuestros Productos</p>
          <div className='block2Struct'></div>
        </div>
        <div className='block3 struct'></div>
      </section>
    </>
  )
}

export default App
