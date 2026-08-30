export interface Certification {
  name: string;
  issuer: string;
  year: string;
}

export const certifications: Certification[] = [
  { name: 'Google Cloud Certified Professional Cloud Architect', issuer: 'Google', year: '2026' },
  { name: 'Google Business Intelligence Specialization', issuer: 'Google', year: '2024' },
  { name: 'Advanced Data Science with IBM Specialization', issuer: 'Coursera', year: '2023' },
  { name: 'Applied AI with DeepLearning', issuer: 'Coursera', year: '2023' },
  { name: 'Advanced Machine Learning and Signal Processing', issuer: 'Coursera', year: '2023' },
  { name: 'MLOps Platforms: Amazon SageMaker and Azure ML', issuer: 'Coursera', year: '2023' },
  { name: 'Optimize TensorFlow Models for Deployment with TensorRT', issuer: 'Coursera', year: '2023' },
  { name: 'MLOps Specialization', issuer: 'Duke University', year: '2023' },
  { name: 'Self-Driving Car Engineer Nanodegree', issuer: 'Udacity', year: '2017' },
  { name: 'Intel Edge AI for IoT Developers Nanodegree', issuer: 'Udacity', year: '2020' },
  { name: 'BS in Software Engineering', issuer: 'The University of Karachi', year: '2014' },
];
