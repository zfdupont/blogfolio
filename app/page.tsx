import { BlogPosts } from 'app/components/posts'

export default function Page() {
  return (
    <section>
      <h1 className="mb-8 text-2xl font-semibold tracking-tighter">
        About me
      </h1>
      <p className="mb-4">
        {`Hello! I'm Zachary Dupont, a Computer Science graduate from Stony Brook University. With a strong foundation in software engineering and hands-on experience from internships at MongoDB and Walmart, I specialize in backend development, data engineering, and sports analytics.`}
      </p>
      <p className="mb-4">
        {`Here, you'll find entries on current projects I'm working on, development blogs detailing these projects, and my thoughts on current trends in technology.`}
      </p>
      <div className="my-8">
        <BlogPosts />
      </div>
    </section>
  );
}
