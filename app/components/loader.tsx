import { useEffect } from 'react'

export default function Loader() {
  useEffect(() => {
    async function getLoader() {
      const { newtonsCradle } = await import('ldrs')
      newtonsCradle.register()
    }
    getLoader()
  }, [])
  return (
    <div className='h-screen flex items-center justify-center'>
      <l-newtons-cradle color="gray"></l-newtons-cradle>
    </div>
  )
}